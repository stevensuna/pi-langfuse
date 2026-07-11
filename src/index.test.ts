import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const langfuseMocks = vi.hoisted(() => {
	const trace = { id: "trace-1", update: vi.fn() };
	const span = { id: "span-1", update: vi.fn(), end: vi.fn() };
	const generation = { id: "generation-1", update: vi.fn(), end: vi.fn() };
	const client = {
		trace: vi.fn(() => trace),
		span: vi.fn(() => span),
		generation: vi.fn(() => generation),
	};
	return {
		client,
		trace,
		span,
		generation,
		getClient: vi.fn(async () => client),
		flushClient: vi.fn(async () => undefined),
		shutdownClient: vi.fn(async () => undefined),
	};
});

vi.mock("./langfuse-client.js", () => ({
	getClient: langfuseMocks.getClient,
	flushClient: langfuseMocks.flushClient,
	shutdownClient: langfuseMocks.shutdownClient,
}));

import registerExtension from "./index.js";

type ExtensionArg = Parameters<typeof registerExtension>[0];
type EventHandler = (event: unknown, ctx?: unknown) => Promise<void> | void;

describe("index (extension entry)", () => {
	const mockPi = {
		events: {
			on: vi.fn(),
			emit: vi.fn(),
		},
		on: vi.fn(),
		registerCommand: vi.fn(),
		model: { id: "test-model", provider: "test-provider" },
	};

	beforeEach(() => {
		vi.resetAllMocks();
		langfuseMocks.getClient.mockResolvedValue(langfuseMocks.client);
		langfuseMocks.client.trace.mockImplementation(() => langfuseMocks.trace);
		langfuseMocks.client.span.mockImplementation(() => langfuseMocks.span);
		langfuseMocks.client.generation.mockImplementation(
			() => langfuseMocks.generation,
		);
		mockPi.events.emit.mockImplementation(() => undefined);
		delete process.env.PI_LANGFUSE_RAW_TRACE;
		delete process.env.PI_LANGFUSE_RAW_TRACE_DIR;
		delete process.env.PI_LANGFUSE_REDACTION_SECRETS;
		delete process.env.PI_LANGFUSE_SKIP_UNPERSISTED;
		delete process.env.PI_LANGFUSE_RAW_PROVIDER_REQUEST;
		delete process.env.PI_CODING_AGENT_DIR;
	});

	it("should update state on session_start", async () => {
		await registerExtension(mockPi as unknown as ExtensionArg);

		// Find the session_start handler
		const sessionStartCall = mockPi.on.mock.calls.find(
			(call) => call[0] === "session_start",
		);
		expect(sessionStartCall).toBeDefined();
		if (!sessionStartCall)
			throw new Error("session_start handler not registered");
		const sessionStartHandler = sessionStartCall[1] as EventHandler;

		const mockCtx = {
			sessionManager: {
				getSessionFile: () => "/path/to/test-session.jsonl",
			},
		};

		await sessionStartHandler({ reason: "test-reason" }, mockCtx);
		// Internal state isn't exported, but we can verify it doesn't throw and
		// we could potentially verify downstream effects if we mocked more.
	});

	it("should show Langfuse status in the footer status line on session_start", async () => {
		mockPi.events.emit.mockImplementation((event, probe) => {
			if (event === "extension:settings:get") {
				probe.values = {
					enabled: true,
					"public-key": "pk-test",
					"secret-key": "sk-test",
					"base-url": "http://localhost:3100",
				};
			}
		});
		await registerExtension(mockPi as unknown as ExtensionArg);

		const sessionStartCall = mockPi.on.mock.calls.find(
			(call) => call[0] === "session_start",
		);
		if (!sessionStartCall)
			throw new Error("session_start handler not registered");
		const sessionStartHandler = sessionStartCall[1] as EventHandler;
		const setStatus = vi.fn();

		await sessionStartHandler(
			{ reason: "test-reason" },
			{
				ui: { setStatus },
				sessionManager: {
					getSessionFile: () => "/path/to/test-session.jsonl",
				},
			},
		);

		expect(setStatus).toHaveBeenCalledWith("pi-langfuse:status", "Langfuse 🟢");
	});

	it("does not print when tracing is disabled", async () => {
		const consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});
		mockPi.events.emit.mockImplementation((event, probe) => {
			if (event === "extension:settings:get") {
				probe.values = { enabled: false };
			}
		});

		await registerExtension(mockPi as unknown as ExtensionArg);

		expect(consoleLog).not.toHaveBeenCalledWith(
			"📊 Langfuse: Tracing disabled in extension settings",
		);
		consoleLog.mockRestore();
	});

	it("does not write raw traces when legacy environment requests them", async () => {
		const rawTraceDir = mkdtempSync(join(tmpdir(), "pi-langfuse-index-test-"));
		const sessionFile = "/tmp/pi-agent/sessions/--work--/session.jsonl";
		process.env.PI_CODING_AGENT_DIR = mkdtempSync(
			join(tmpdir(), "pi-langfuse-agent-test-"),
		);
		process.env.PI_LANGFUSE_RAW_TRACE = "1";
		process.env.PI_LANGFUSE_RAW_TRACE_DIR = rawTraceDir;
		process.env.PI_LANGFUSE_REDACTION_SECRETS = "custom-super-secret-987654321";
		process.env.PI_LANGFUSE_SKIP_UNPERSISTED = "0";

		mockPi.events.emit.mockImplementation((event, probe) => {
			if (event === "extension:settings:get") {
				probe.values = {
					enabled: false,
					"redaction-enabled": true,
				};
			}
		});

		await registerExtension(mockPi as unknown as ExtensionArg);
		const beforeAgentStartCall = mockPi.on.mock.calls.find(
			(call) => call[0] === "before_agent_start",
		);
		if (!beforeAgentStartCall)
			throw new Error("before_agent_start handler not registered");
		const beforeAgentStartHandler = beforeAgentStartCall[1] as EventHandler;

		await beforeAgentStartHandler(
			{
				prompt:
					"Use sk-lf-live-secret-1234567890 and custom-super-secret-987654321",
				systemPrompt: "LANGFUSE_SECRET_KEY=sk-lf-live-secret-1234567890",
				systemPromptOptions: { cwd: "/tmp/work" },
			},
			{
				model: { id: "test-model", provider: "test-provider" },
				sessionManager: { getSessionFile: () => sessionFile },
			},
		);

		expect(existsSync(join(rawTraceDir, "--work--", "session.jsonl"))).toBe(
			false,
		);
	});

	it("should update model on model_select", async () => {
		await registerExtension(mockPi as unknown as ExtensionArg);

		const modelSelectCall = mockPi.on.mock.calls.find(
			(call) => call[0] === "model_select",
		);
		expect(modelSelectCall).toBeDefined();
		if (!modelSelectCall)
			throw new Error("model_select handler not registered");
		const modelSelectHandler = modelSelectCall[1] as EventHandler;

		await modelSelectHandler({
			model: { id: "new-model", provider: "new-provider" },
		});
	});

	it("finalizes usage and cost without writing Langfuse text into the terminal", async () => {
		mockPi.events.emit.mockImplementation((event, probe) => {
			if (event === "extension:settings:get") {
				probe.values = {
					enabled: true,
					"public-key": "pk-test",
					"secret-key": "sk-test",
					"base-url": "http://localhost:3100",
				};
			}
		});
		await registerExtension(mockPi as unknown as ExtensionArg);

		const handler = (eventName: string) => {
			const call = mockPi.on.mock.calls.find((entry) => entry[0] === eventName);
			if (!call) throw new Error(`Missing ${eventName} handler`);
			return call[1] as EventHandler;
		};
		const setStatus = vi.fn();
		const notify = vi.fn();
		const ctx = {
			model: { id: "test-model", provider: "test-provider" },
			ui: { setStatus, notify },
			sessionManager: {
				getSessionFile: () => "/path/to/test-session.jsonl",
			},
		};
		const consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});
		const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const consoleError = vi
			.spyOn(console, "error")
			.mockImplementation(() => {});

		try {
			await handler("session_start")({ reason: "test" }, ctx);
			await handler("before_agent_start")(
				{
					prompt: "hello",
					systemPrompt: "system",
					systemPromptOptions: { cwd: "/tmp/work" },
				},
				ctx,
			);
			await handler("agent_start")({});
			await handler("turn_start")({ turnIndex: 0 });
			await handler("message_start")({ message: { role: "assistant" } });
			await handler("message_end")({
				message: {
					role: "assistant",
					model: "test-model",
					content: [{ type: "text", text: "done" }],
					usage: {
						input: 11,
						output: 7,
						cost: { input: 0.001, output: 0.002, total: 0.003 },
					},
				},
			});

			expect(langfuseMocks.generation.end).toHaveBeenCalledWith(
				expect.objectContaining({
					output: "done",
					usage: { input: 11, output: 7, total: 18 },
					usageDetails: { input: 11, output: 7 },
					costDetails: { input: 0.001, output: 0.002, total: 0.003 },
				}),
			);
			expect(consoleLog).not.toHaveBeenCalled();
			expect(consoleWarn).not.toHaveBeenCalled();
			expect(consoleError).not.toHaveBeenCalled();
		} finally {
			consoleLog.mockRestore();
			consoleWarn.mockRestore();
			consoleError.mockRestore();
		}
	});

	it("reports repeated trace failures once through Pi notifications", async () => {
		mockPi.events.emit.mockImplementation((event, probe) => {
			if (event === "extension:settings:get") {
				probe.values = {
					enabled: true,
					"public-key": "pk-test",
					"secret-key": "sk-test",
					"base-url": "http://localhost:3100",
				};
			}
		});
		langfuseMocks.getClient.mockRejectedValue(new Error("credential detail"));
		await registerExtension(mockPi as unknown as ExtensionArg);

		const beforeAgentStartCall = mockPi.on.mock.calls.find(
			(call) => call[0] === "before_agent_start",
		);
		const sessionStartCall = mockPi.on.mock.calls.find(
			(call) => call[0] === "session_start",
		);
		if (!beforeAgentStartCall || !sessionStartCall)
			throw new Error("Missing tracing handlers");
		const beforeAgentStart = beforeAgentStartCall[1] as EventHandler;
		const sessionStart = sessionStartCall[1] as EventHandler;
		const notify = vi.fn();
		const ctx = {
			model: { id: "test-model", provider: "test-provider" },
			ui: { notify, setStatus: vi.fn() },
			sessionManager: {
				getSessionFile: () => "/path/to/test-session.jsonl",
			},
		};
		const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});

		try {
			await sessionStart({ reason: "test" }, ctx);
			await beforeAgentStart(
				{ prompt: "one", systemPrompt: "system", systemPromptOptions: {} },
				ctx,
			);
			await beforeAgentStart(
				{ prompt: "two", systemPrompt: "system", systemPromptOptions: {} },
				ctx,
			);

			expect(notify).toHaveBeenCalledTimes(1);
			expect(notify).toHaveBeenCalledWith(
				"Langfuse: Unable to create Langfuse trace",
				"warning",
			);
			expect(notify).not.toHaveBeenCalledWith(
				expect.stringContaining("credential detail"),
				expect.anything(),
			);
			expect(consoleWarn).not.toHaveBeenCalled();
		} finally {
			consoleWarn.mockRestore();
		}
	});
});
