import { type SettingsValues } from "./settings.js";
export type RawTraceProviderRequestMode = "summary" | "full" | "off";
export interface Config {
    publicKey: string;
    secretKey: string;
    host: string;
    enabled: boolean;
    userId: string;
    defaultTags: string[];
    release: string;
    environment: string;
    traceInputMaxChars: number;
    traceOutputMaxChars: number;
    toolArgsMaxChars: number;
    toolOutputMaxChars: number;
    captureToolProgress: boolean;
    captureMessageUpdates: boolean;
    skipUnpersistedSessions: boolean;
    captureProviderPayload: boolean;
    providerPayloadMaxChars: number;
    redactionEnabled: boolean;
    redactionAdditionalSecrets: string[];
    rawTraceEnabled: boolean;
    rawTraceDir: string;
    rawTraceProviderRequestMode: RawTraceProviderRequestMode;
    localAutostart: boolean;
    localAutostartDir: string;
    localAutostartHealthUrl: string;
    localAutostartTimeoutMs: number;
    modelsDevPath?: string;
}
export declare function resolveConfig(settings: Partial<SettingsValues>): Config;
export declare function canTrace(config: Config): boolean;
export declare function getConfigWarnings(config: Config): string[];
//# sourceMappingURL=config.d.ts.map