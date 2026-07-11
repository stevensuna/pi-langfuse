export type DiagnosticLevel = "info" | "warning" | "error";
export interface Diagnostic {
    code: string;
    message: string;
    level?: DiagnosticLevel;
}
export type DiagnosticReporter = (diagnostic: Required<Diagnostic>) => void;
/**
 * Pi extensions run inside the interactive TUI. Writing directly to stdout or
 * stderr corrupts its render surface, so runtime diagnostics must go through
 * Pi's UI notification API instead.
 */
export declare function setDiagnosticReporter(next?: DiagnosticReporter, reset?: boolean): void;
export declare function reportDiagnostic(diagnostic: Diagnostic): void;
//# sourceMappingURL=diagnostics.d.ts.map