import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { estimateCostFromModelsDev } from "./model-pricing.js";

const directories: string[] = [];

afterEach(() => {
	for (const directory of directories.splice(0)) {
		rmSync(directory, { recursive: true, force: true });
	}
});

describe("estimateCostFromModelsDev", () => {
	it("matches provider and model and preserves cache-specific pricing", () => {
		const directory = mkdtempSync(join(tmpdir(), "pi-langfuse-model-pricing-"));
		directories.push(directory);
		const path = join(directory, "catalog.json");
		writeFileSync(
			path,
			JSON.stringify({
				longcat: {
					models: {
						"LongCat-2.0": {
							id: "LongCat-2.0",
							cost: { input: 0.75, cache_read: 0.015, output: 2.95 },
						},
					},
				},
			}),
		);

		const estimate = estimateCostFromModelsDev({
			catalogPath: path,
			provider: "LongCat",
			model: "LongCat-2.0",
			input: 1_000_000,
			cacheRead: 1_000_000,
			output: 1_000_000,
		});
		expect(estimate).toMatchObject({
			source: "models.dev",
			details: {
				input: 0.75,
				cache_read_input_tokens: 0.015,
				output: 2.95,
			},
		});
		expect(estimate?.details.total).toBeCloseTo(3.715, 12);
	});
});
