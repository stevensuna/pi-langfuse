import { afterEach, describe, expect, it, vi } from "vitest";
import type { Config } from "./config.js";
import { getClient, shutdownClient } from "./langfuse-client.js";

const mocks = vi.hoisted(() => {
	let sequence = 0;
	const observations: Array<{
		attributes: unknown;
		updates: unknown[];
		end: ReturnType<typeof vi.fn>;
	}> = [];
	const propagated: unknown[] = [];
	const create = (attributes: unknown) => {
		const record = { attributes, updates: [] as unknown[], end: vi.fn() };
		observations.push(record);
		const id = `span-${++sequence}`;
		return {
			id,
			traceId: "trace-1",
			end: record.end,
			updateOtelSpanAttributes: vi.fn((update) => record.updates.push(update)),
			startObservation: vi.fn((_name, childAttributes) =>
				create(childAttributes),
			),
		};
	};
	return {
		observations,
		propagated,
		create,
		processor: { forceFlush: vi.fn(), shutdown: vi.fn() },
	};
});

vi.mock("@langfuse/tracing", () => ({
	LangfuseOtelSpanAttributes: {
		TRACE_NAME: "langfuse.trace.name",
		TRACE_USER_ID: "user.id",
		TRACE_SESSION_ID: "session.id",
		TRACE_TAGS: "langfuse.trace.tags",
		TRACE_METADATA: "langfuse.trace.metadata",
		RELEASE: "langfuse.release",
		VERSION: "langfuse.version",
	},
	propagateAttributes: (attributes: unknown, callback: () => unknown) => {
		mocks.propagated.push(attributes);
		return callback();
	},
	setLangfuseTracerProvider: vi.fn(),
	startObservation: vi.fn((_name, attributes) => mocks.create(attributes)),
}));
vi.mock("@langfuse/otel", () => ({
	LangfuseSpanProcessor: vi.fn(() => mocks.processor),
}));
vi.mock("@opentelemetry/sdk-trace-node", () => ({
	NodeTracerProvider: vi.fn(() => ({ register: vi.fn(), shutdown: vi.fn() })),
}));

const config: Config = {
	enabled: true,
	publicKey: "pk-lf-test",
	secretKey: "sk-lf-test-secret-1234567890",
	host: "http://localhost:3100",
	userId: "tester",
	defaultTags: [],
	release: "",
	environment: "",
	traceInputMaxChars: 2000,
	traceOutputMaxChars: 2000,
	toolArgsMaxChars: 500,
	toolOutputMaxChars: 2000,
	captureToolProgress: true,
	captureMessageUpdates: false,
	skipUnpersistedSessions: true,
	captureProviderPayload: false,
	providerPayloadMaxChars: 50_000,
	redactionEnabled: true,
	redactionAdditionalSecrets: [],
	rawTraceEnabled: false,
	rawTraceDir: "/tmp/raw",
	rawTraceProviderRequestMode: "summary",
	localAutostart: false,
	localAutostartDir: "/tmp/langfuse",
	localAutostartHealthUrl: "http://localhost:3100/api/public/health",
	localAutostartTimeoutMs: 200,
};

describe("Langfuse v5 OTel compatibility client", () => {
	afterEach(async () => {
		mocks.observations.length = 0;
		mocks.propagated.length = 0;
		vi.clearAllMocks();
		await shutdownClient();
	});

	it("preserves hierarchy and sanitizes OTel attributes before export", async () => {
		const lf = await getClient(config);
		const trace = lf.trace({
			name: "pi-agent",
			input: "secret sk-lf-test-secret-1234567890",
		});
		const span = lf.span({
			name: "tool:bash",
			traceId: trace.id,
			input: "ghp_abcdefghijklmnopqrstuvwxyz1234567890",
		});
		const generation = lf.generation({
			name: "llm-response",
			traceId: trace.id,
			parentObservationId: span.id,
			input: "Bearer abcdefghijklmnopqrstuvwxyz123456",
		});
		generation.end({ output: "hf_abcdefghijklmnopqrstuvwxyz" });
		span.end({ output: 'data: 0:"Hello!"' });

		const serialized = JSON.stringify(mocks.observations);
		expect(mocks.observations).toHaveLength(3);
		expect(serialized).not.toContain("sk-lf-test-secret-1234567890");
		expect(serialized).not.toContain(
			"ghp_abcdefghijklmnopqrstuvwxyz1234567890",
		);
		expect(serialized).not.toContain("Bearer abcdefghijklmnopqrstuvwxyz123456");
		expect(serialized).toContain("[REDACTED:langfuse-secret-key:");
		expect(serialized).toContain("[REDACTED:github-token:");
		expect(serialized).toContain("[REDACTED:bearer-token:");
		expect(serialized).toContain("[REDACTED:huggingface-token:");
	});

	it("keeps propagated metadata within the v5 string contract", async () => {
		const lf = await getClient(config);
		lf.trace({
			name: "pi-agent",
			metadata: {
				systemPrompt: Array.from(
					{ length: 30 },
					(_, index) => `metadata section ${index}`,
				).join(" | "),
				previousSessionFile: undefined,
				nested: { source: "Pi" },
			},
		});

		const metadata = (
			mocks.propagated.at(-1) as { metadata?: Record<string, string> }
		).metadata;
		expect(metadata?.systemPrompt).toHaveLength(200);
		expect(metadata).not.toHaveProperty("previousSessionFile");
		expect(metadata?.nested).toBe('{"source":"Pi"}');
	});
});
