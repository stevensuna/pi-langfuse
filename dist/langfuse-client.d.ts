import type { Config } from "./config.js";
type Metadata = Record<string, unknown>;
type Body = {
    metadata?: Metadata;
    input?: unknown;
    output?: unknown;
    usage?: unknown;
    usageDetails?: Record<string, number>;
    costDetails?: Record<string, number>;
    model?: string;
    statusMessage?: string;
    isError?: boolean;
};
type TraceAttributes = {
    traceName: string;
    userId?: string;
    sessionId?: string;
    tags?: string[];
    metadata?: Metadata;
    version?: string;
    release?: string;
};
type TraceUpdate = Body & Partial<TraceAttributes> & {
    environment?: string;
};
export interface LangfuseTrace {
    id: string;
    update(body?: TraceUpdate): void;
}
export interface LangfuseSpan {
    id: string;
    update?(body: Body): void;
    end(body?: Body): void;
}
export interface LangfuseGeneration extends LangfuseSpan {
}
export declare function flushClient(): Promise<void>;
export declare function shutdownClient(): Promise<void>;
export declare function getClient(config: Config): Promise<{
    trace(body: {
        id?: string | null;
        name: string;
        metadata?: Metadata;
        input?: unknown;
        output?: unknown;
        sessionId?: string;
        userId?: string;
        tags?: string[];
        release?: string;
        version?: string;
        environment?: string;
        public?: boolean;
    }): {
        id: string;
        update(updateBody: TraceUpdate): void;
    };
    span(body: {
        name: string;
        traceId: string;
        parentObservationId?: string;
    } & Body): LangfuseSpan;
    generation(body: {
        name: string;
        traceId: string;
        parentObservationId?: string;
    } & Body): LangfuseGeneration;
}>;
export {};
//# sourceMappingURL=langfuse-client.d.ts.map