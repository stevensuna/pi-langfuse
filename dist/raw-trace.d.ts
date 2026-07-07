import { type RedactionConfig } from "./redaction.js";
interface RawTraceConfig extends RedactionConfig {
    rawTraceEnabled: boolean;
    rawTraceDir: string;
}
interface RawTraceBaseRecord {
    type: string;
    timestamp: string;
    sessionId?: string;
    sessionFile?: string;
    traceId?: string;
    turnIndex?: number;
    provider?: string;
    model?: string;
    runtime?: string;
}
type RawTraceRecord = RawTraceBaseRecord & Record<string, unknown>;
/**
 * Flush any pending raw trace writes synchronously.
 * Call before process exit to avoid losing queued records.
 */
export declare function drainRawTraceQueue(): void;
export declare function defaultRawTraceDir(): string;
export declare function rawTracePathForSession(sessionFile: string | undefined, rawTraceDir?: string): string | undefined;
/**
 * Enqueue a raw trace record for asynchronous writing.
 * Returns immediately — actual redaction + file I/O happens on the next
 * microtask, so the Pi event handler is never blocked by regex redaction
 * or synchronous file writes.
 */
export declare function appendRawTrace(config: RawTraceConfig, sessionFile: string | undefined, record: RawTraceRecord): void;
export {};
//# sourceMappingURL=raw-trace.d.ts.map