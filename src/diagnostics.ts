export type DiagnosticLevel = "info" | "warning" | "error";

export interface Diagnostic {
	code: string;
	message: string;
	level?: DiagnosticLevel;
}

export type DiagnosticReporter = (diagnostic: Required<Diagnostic>) => void;

let reporter: DiagnosticReporter | undefined;
let reportedCodes = new Set<string>();

/**
 * Pi extensions run inside the interactive TUI. Writing directly to stdout or
 * stderr corrupts its render surface, so runtime diagnostics must go through
 * Pi's UI notification API instead.
 */
export function setDiagnosticReporter(next?: DiagnosticReporter, reset = true) {
	reporter = next;
	if (reset) reportedCodes = new Set();
}

export function reportDiagnostic(diagnostic: Diagnostic) {
	if (reportedCodes.has(diagnostic.code)) return;
	reportedCodes.add(diagnostic.code);
	reporter?.({
		code: diagnostic.code,
		message: diagnostic.message,
		level: diagnostic.level ?? "warning",
	});
}
