import { LangfuseSpanProcessor } from "@langfuse/otel";
import { LangfuseOtelSpanAttributes, propagateAttributes, setLangfuseTracerProvider, startObservation, } from "@langfuse/tracing";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { sanitizeForTelemetry } from "./redaction.js";
let provider = null;
let processor = null;
let configKey = "";
const traces = new Map();
const observations = new Map();
function sanitize(config, value) {
    return sanitizeForTelemetry(config, value);
}
function traceTelemetryAttributes(attributes) {
    if (!attributes)
        return {};
    return {
        [LangfuseOtelSpanAttributes.TRACE_NAME]: attributes.traceName,
        [LangfuseOtelSpanAttributes.TRACE_USER_ID]: attributes.userId,
        [LangfuseOtelSpanAttributes.TRACE_SESSION_ID]: attributes.sessionId,
        [LangfuseOtelSpanAttributes.TRACE_TAGS]: attributes.tags,
        [LangfuseOtelSpanAttributes.TRACE_METADATA]: attributes.metadata
            ? JSON.stringify(attributes.metadata)
            : undefined,
        [LangfuseOtelSpanAttributes.RELEASE]: attributes.release,
        [LangfuseOtelSpanAttributes.VERSION]: attributes.version,
    };
}
function observationAttributes(config, body, traceAttributes) {
    const safe = sanitize(config, body ?? {});
    return {
        ...traceTelemetryAttributes(traceAttributes),
        input: safe.input,
        output: safe.output,
        metadata: safe.metadata,
        model: safe.model,
        usage: safe.usage,
        usageDetails: safe.usageDetails,
        costDetails: safe.costDetails,
        statusMessage: safe.statusMessage,
        level: safe.isError ? "ERROR" : undefined,
    };
}
function propagatedAttributes(attributes) {
    return {
        ...attributes,
        metadata: attributes.metadata
            ? Object.fromEntries(Object.entries(attributes.metadata).flatMap(([key, value]) => {
                if (value === undefined || value === null)
                    return [];
                const text = typeof value === "string" ? value : JSON.stringify(value);
                if (text === undefined)
                    return [];
                return [[key, text.slice(0, 200)]];
            }))
            : undefined,
    };
}
function update(observation, config, body, traceAttributes) {
    if (!body)
        return;
    observation.updateOtelSpanAttributes(observationAttributes(config, body, traceAttributes));
}
function wrapObservation(observation, config, traceAttributes) {
    observations.set(observation.id, observation);
    return {
        id: observation.id,
        update(body) {
            update(observation, config, body, traceAttributes);
        },
        end(body) {
            update(observation, config, body, traceAttributes);
            observation.end();
        },
    };
}
async function resetClient() {
    if (provider)
        await provider.shutdown();
    provider = null;
    processor = null;
    configKey = "";
    traces.clear();
    observations.clear();
    setLangfuseTracerProvider(null);
}
function ensureClient(config) {
    const nextKey = JSON.stringify([config.publicKey, config.secretKey, config.host]);
    if (provider && configKey === nextKey)
        return;
    if (provider)
        throw new Error("Langfuse configuration changed during an active Pi session");
    processor = new LangfuseSpanProcessor({
        publicKey: config.publicKey,
        secretKey: config.secretKey,
        baseUrl: config.host,
        environment: config.environment,
        release: config.release || undefined,
        exportMode: "immediate",
        mask: ({ data }) => sanitizeForTelemetry(config, data),
    });
    provider = new NodeTracerProvider({ spanProcessors: [processor] });
    provider.register();
    setLangfuseTracerProvider(provider);
    configKey = nextKey;
}
export async function flushClient() {
    await processor?.forceFlush();
}
export async function shutdownClient() {
    await resetClient();
}
export async function getClient(config) {
    ensureClient(config);
    return {
        trace(body) {
            const safe = sanitize(config, body);
            const attributes = {
                traceName: safe.name,
                metadata: safe.metadata,
                sessionId: safe.sessionId,
                userId: safe.userId,
                tags: safe.tags,
                release: safe.release,
                version: safe.version,
            };
            const root = propagateAttributes(propagatedAttributes(attributes), () => startObservation(safe.name, observationAttributes(config, safe, attributes), {
                asType: "span",
            }));
            traces.set(root.traceId, { root, attributes });
            observations.set(root.id, root);
            return {
                id: root.traceId,
                update(updateBody) {
                    const state = traces.get(root.traceId);
                    if (!state || !updateBody)
                        return;
                    state.attributes = { ...state.attributes, ...sanitize(config, updateBody) };
                    update(root, config, updateBody, state.attributes);
                    // The legacy extension finalizes a prompt by updating its trace output.
                    // In OTel the root observation must be ended for the exporter to emit
                    // the complete hierarchy to the v4 events pipeline.
                    if (updateBody.output !== undefined)
                        root.end();
                },
            };
        },
        span(body) {
            const state = traces.get(body.traceId);
            const parent = (body.parentObservationId && observations.get(body.parentObservationId)) || state?.root;
            if (!state || !parent)
                throw new Error("Langfuse parent observation was not found");
            const child = propagateAttributes(propagatedAttributes(state.attributes), () => parent.startObservation(body.name, observationAttributes(config, body, state.attributes), { asType: "span" }));
            return wrapObservation(child, config, state.attributes);
        },
        generation(body) {
            const state = traces.get(body.traceId);
            const parent = (body.parentObservationId && observations.get(body.parentObservationId)) || state?.root;
            if (!state || !parent)
                throw new Error("Langfuse parent observation was not found");
            const child = propagateAttributes(propagatedAttributes(state.attributes), () => parent.startObservation(body.name, observationAttributes(config, body, state.attributes), { asType: "generation" }));
            return wrapObservation(child, config, state.attributes);
        },
    };
}
//# sourceMappingURL=langfuse-client.js.map