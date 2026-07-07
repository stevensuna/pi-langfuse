export interface RedactionConfig {
    redactionEnabled: boolean;
    redactionAdditionalSecrets?: string[];
    secretKey?: string;
}
export declare function isSensitiveKey(key: string): boolean;
export declare function redactString(config: RedactionConfig, input: string, env?: NodeJS.ProcessEnv): string;
export declare function sanitizeForTelemetry<T>(config: RedactionConfig, value: T, env?: NodeJS.ProcessEnv, seen?: WeakSet<object>): T;
export interface RedactionFinding {
    reason: string;
    count: number;
}
export declare function scanForSecrets(config: RedactionConfig, input: string, env?: NodeJS.ProcessEnv): RedactionFinding[];
export declare function redactionMetadata(config: RedactionConfig): {
    applied: boolean;
};
//# sourceMappingURL=redaction.d.ts.map