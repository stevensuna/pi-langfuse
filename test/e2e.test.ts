import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { resolveConfig } from "../src/config.js";
import {
	flushClient,
	getClient,
	shutdownClient,
} from "../src/langfuse-client.js";

const skipE2E =
	process.env.RUN_LANGFUSE_E2E !== "1" ||
	!process.env.LANGFUSE_PUBLIC_KEY ||
	!process.env.LANGFUSE_SECRET_KEY;

describe.runIf(!skipE2E)("Langfuse v4 E2E Integration", () => {
	const config = resolveConfig({});
	const testId = `e2e-test-${randomUUID()}`;
	const traceName = `e2e-pi-${testId}`;

	beforeEach(async () => shutdownClient());

	it("ingests a nested OTel generation and reads it through Metrics v2", async () => {
		const lf = await getClient(config);
		const trace = lf.trace({
			name: traceName,
			sessionId: testId,
			tags: ["workflow:ai-sdlc", "agent:pi", "env:e2e-test"],
		});
		const span = lf.span({
			name: "test.parent",
			traceId: trace.id,
			input: "parent input",
		});
		const generation = lf.generation({
			name: "test.generation",
			traceId: trace.id,
			parentObservationId: span.id,
			model: "gpt-3.5-turbo",
			input: "What is 2+2?",
		});
		generation.end({
			output: "4",
			usageDetails: { input: 5, output: 5, total: 10 },
		});
		span.end({ output: "done" });
		trace.update({ output: "done" });
		await flushClient();

		const auth = Buffer.from(
			`${config.publicKey}:${config.secretKey}`,
		).toString("base64");
		const baseUrl = config.host.replace(/\/$/, "");
		const query = {
			view: "observations",
			dimensions: [
				{ field: "traceName" },
				{ field: "providedModelName" },
				{ field: "usageType" },
			],
			metrics: [{ measure: "usageByType", aggregation: "sum" }],
			filters: [],
			fromTimestamp: new Date(Date.now() - 60_000).toISOString(),
			toTimestamp: new Date(Date.now() + 60_000).toISOString(),
			config: { row_limit: 100 },
		};
		let data: Array<Record<string, unknown>> = [];
		for (let attempt = 0; attempt < 10; attempt++) {
			const url = `${baseUrl}/api/public/v2/metrics?query=${encodeURIComponent(JSON.stringify(query))}`;
			const response = await fetch(url, {
				headers: { Authorization: `Basic ${auth}` },
			});
			if (response.ok)
				data = (
					(await response.json()) as { data: Array<Record<string, unknown>> }
				).data;
			if (
				data.some(
					(row) =>
						row.traceName === traceName &&
						row.usageType === "total" &&
						Number(row.sum_usageByType) === 10,
				)
			)
				break;
			await new Promise((resolve) => setTimeout(resolve, 2_000));
		}
		expect(
			data.some(
				(row) =>
					row.traceName === traceName &&
					row.usageType === "total" &&
					Number(row.sum_usageByType) === 10,
			),
		).toBe(true);
	}, 30_000);
});
