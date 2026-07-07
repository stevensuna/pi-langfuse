import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
export declare const EXTENSION_ID = "pi-langfuse";
export interface SettingsValues {
    enabled: boolean;
    "public-key": string;
    "secret-key": string;
    "base-url": string;
    "user-id": string;
    "default-tags": string;
    release: string;
    environment: string;
    "trace-input-max-chars": number;
    "trace-output-max-chars": number;
    "tool-args-max-chars": number;
    "tool-output-max-chars": number;
    "capture-tool-progress": boolean;
    "capture-message-updates": boolean;
    "redaction-enabled": boolean;
    "raw-trace-enabled": boolean;
    "raw-trace-dir": string;
}
export declare const DEFAULT_SETTINGS: SettingsValues;
export declare function getStoredSettingsValues(pi?: ExtensionAPI): Partial<SettingsValues>;
export declare function getSettingsValues(pi?: ExtensionAPI): SettingsValues;
export declare function setSettingsValues(nextValues: Partial<SettingsValues>): void;
export declare function registerSettings(pi: ExtensionAPI, defaults?: SettingsValues): void;
//# sourceMappingURL=settings.d.ts.map