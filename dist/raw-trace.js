import { appendFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import { sanitizeForTelemetry } from "./redaction.js";
const writeQueue = [];
let flushScheduled = false;
function scheduleFlush() {
    if (flushScheduled)
        return;
    flushScheduled = true;
    queueMicrotask(() => {
        flushScheduled = false;
        flushQueue();
    });
}
function flushQueue() {
    while (writeQueue.length > 0) {
        const item = writeQueue.shift();
        if (!item)
            break;
        const { path, config, record } = item;
        try {
            const sanitizedRecord = sanitizeForTelemetry(config, record);
            appendFileSync(path, `${JSON.stringify(sanitizedRecord, jsonReplacer)}\n`, "utf-8");
        }
        catch (error) {
            console.warn("📊 Langfuse: Failed to write raw trace", error);
        }
    }
}
/**
 * Flush any pending raw trace writes synchronously.
 * Call before process exit to avoid losing queued records.
 */
export function drainRawTraceQueue() {
    flushScheduled = false;
    flushQueue();
}
export function defaultRawTraceDir() {
    return join(process.env.PI_CODING_AGENT_DIR || join(homedir(), ".pi", "agent"), "langfuse", "raw-traces");
}
export function rawTracePathForSession(sessionFile, rawTraceDir = defaultRawTraceDir()) {
    if (!sessionFile)
        return undefined;
    const marker = "/sessions/";
    const index = sessionFile.indexOf(marker);
    if (index === -1)
        return join(rawTraceDir, "--unknown--", basename(sessionFile));
    const relativePath = sessionFile.slice(index + marker.length);
    return join(rawTraceDir, relativePath.includes("/")
        ? relativePath
        : join("--unknown--", relativePath));
}
function jsonReplacer(_key, value) {
    if (typeof value === "bigint")
        return value.toString();
    if (value instanceof Error) {
        return {
            name: value.name,
            message: value.message,
            stack: value.stack,
        };
    }
    if (typeof value === "function")
        return `[function ${value.name || "anonymous"}]`;
    return value;
}
/**
 * Enqueue a raw trace record for asynchronous writing.
 * Returns immediately — actual redaction + file I/O happens on the next
 * microtask, so the Pi event handler is never blocked by regex redaction
 * or synchronous file writes.
 */
export function appendRawTrace(config, sessionFile, record) {
    if (!config.rawTraceEnabled || !sessionFile)
        return;
    const path = rawTracePathForSession(sessionFile, config.rawTraceDir);
    if (!path)
        return;
    try {
        mkdirSync(dirname(path), { recursive: true });
    }
    catch {
        // Directory creation is best-effort on enqueue; failures surface on flush.
    }
    writeQueue.push({ path, config, record });
    scheduleFlush();
}
//# sourceMappingURL=raw-trace.js.map