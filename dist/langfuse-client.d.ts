import type { Config } from "./config.js";
type LangfuseMetadata = Record<string, unknown>;
type TraceUpdateBody = {
    id?: string | null;
    name?: string;
    metadata?: LangfuseMetadata;
    output?: unknown;
    input?: unknown;
    sessionId?: string;
    userId?: string;
    tags?: string[];
    release?: string;
    version?: string;
    environment?: string;
    public?: boolean;
};
type ObservationEndBody = {
    metadata?: LangfuseMetadata;
    isError?: boolean;
    output?: unknown;
    usage?: unknown;
    usageDetails?: Record<string, number>;
    costDetails?: Record<string, number>;
    model?: string;
    statusMessage?: string;
};
export interface LangfuseTrace {
    id: string;
    update(body?: TraceUpdateBody): void;
}
export interface LangfuseSpan {
    id: string;
    update?(body: {
        metadata?: LangfuseMetadata;
        input?: unknown;
        output?: unknown;
        statusMessage?: string;
    }): void;
    end(body?: ObservationEndBody): void;
}
export interface LangfuseGeneration {
    id: string;
    update?(body: {
        metadata?: LangfuseMetadata;
        usage?: unknown;
        usageDetails?: Record<string, number>;
        output?: unknown;
        costDetails?: Record<string, number>;
        model?: string;
        statusMessage?: string;
    }): void;
    end(body?: ObservationEndBody): void;
}
interface LangfuseClient {
    trace(body?: {
        id?: string | null;
        name: string;
        metadata?: LangfuseMetadata;
        input?: unknown;
        output?: unknown;
        sessionId?: string;
        userId?: string;
        tags?: string[];
        release?: string;
        version?: string;
        environment?: string;
        public?: boolean;
    }): LangfuseTrace;
    span(body: {
        name: string;
        traceId: string;
        parentObservationId?: string;
        metadata?: LangfuseMetadata;
        input?: unknown;
        output?: unknown;
    }): LangfuseSpan;
    generation(body: {
        name: string;
        traceId: string;
        parentObservationId?: string;
        metadata?: LangfuseMetadata;
        input?: unknown;
        output?: unknown;
        usage?: unknown;
        usageDetails?: Record<string, number>;
        model?: string;
        costDetails?: Record<string, number>;
        version?: string;
    }): LangfuseGeneration;
    score(body: {
        name: string;
        value: number;
        traceId?: string;
        observationId?: string;
        sessionId?: string;
        comment?: string;
    }): void;
    flushAsync?(): Promise<void>;
    shutdownAsync(): Promise<void>;
}
export declare function flushClient(): Promise<void>;
export declare function shutdownClient(): Promise<void>;
export declare function getClient(config: Config): Promise<LangfuseClient>;
export {};
//# sourceMappingURL=langfuse-client.d.ts.map