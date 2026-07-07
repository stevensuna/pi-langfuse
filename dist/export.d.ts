import type { Config } from "./config.js";
import { type RedactionFinding } from "./redaction.js";
interface ExportFileResult {
    layer: "pi-session" | "raw-trace";
    path: string;
    status: "approved" | "rejected";
    inputBytes: number;
    outputBytes: number;
    preRedactionFindings: RedactionFinding[];
    residualFindings: RedactionFinding[];
}
interface ExportReport {
    createdAt: string;
    outDir: string;
    files: ExportFileResult[];
    summary: {
        approved: number;
        rejected: number;
        files: number;
    };
    trufflehog?: {
        enabled: boolean;
        required: boolean;
        available: boolean;
        exitCode?: number | null;
        findings: number;
        warning?: string;
    };
}
export interface ExportProgress {
    phase: "discover" | "copy" | "scan" | "write" | "done";
    current?: number;
    total?: number;
    layer?: ExportFileResult["layer"];
    path?: string;
    message: string;
}
type CommandContext = {
    onProgress?: (progress: ExportProgress) => void;
    ui?: {
        notify?: (message: string, type?: "info" | "warning" | "error") => unknown;
    };
};
export declare function exportRedactedData(config: Config, args?: string, ctx?: CommandContext): ExportReport;
export {};
//# sourceMappingURL=export.d.ts.map