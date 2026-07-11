let reporter;
let reportedCodes = new Set();
/**
 * Pi extensions run inside the interactive TUI. Writing directly to stdout or
 * stderr corrupts its render surface, so runtime diagnostics must go through
 * Pi's UI notification API instead.
 */
export function setDiagnosticReporter(next, reset = true) {
    reporter = next;
    if (reset)
        reportedCodes = new Set();
}
export function reportDiagnostic(diagnostic) {
    if (reportedCodes.has(diagnostic.code))
        return;
    reportedCodes.add(diagnostic.code);
    reporter?.({
        code: diagnostic.code,
        message: diagnostic.message,
        level: diagnostic.level ?? "warning",
    });
}
//# sourceMappingURL=diagnostics.js.map