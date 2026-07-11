import { afterEach, describe, expect, it, vi } from "vitest";
import { reportDiagnostic, setDiagnosticReporter } from "./diagnostics.js";

describe("runtime diagnostics", () => {
	afterEach(() => {
		setDiagnosticReporter();
	});

	it("reports a diagnostic once through the configured UI sink", () => {
		const reporter = vi.fn();
		setDiagnosticReporter(reporter);

		reportDiagnostic({
			code: "generation-end-failed",
			message: "Unable to finalize Langfuse generation",
		});
		reportDiagnostic({
			code: "generation-end-failed",
			message: "Unable to finalize Langfuse generation",
		});

		expect(reporter).toHaveBeenCalledTimes(1);
		expect(reporter).toHaveBeenCalledWith({
			code: "generation-end-failed",
			message: "Unable to finalize Langfuse generation",
			level: "warning",
		});
	});

	it("does not report before Pi has provided a UI sink", () => {
		setDiagnosticReporter();
		expect(() =>
			reportDiagnostic({
				code: "trace-create-failed",
				message: "Unable to create Langfuse trace",
			}),
		).not.toThrow();
	});
});
