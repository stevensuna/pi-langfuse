import { Langfuse } from "langfuse";
import { sanitizeForTelemetry } from "./redaction.js";
let client = null;
let clientConfigKey = "";
function isBase64DataUri(value) {
    return /^data:[^,;]+(?:;[^,;]+)*;base64,[A-Za-z0-9+/=_-]+$/i.test(value);
}
function neutralizeLangfuseMediaPrefix(value, seen = new WeakSet()) {
    if (typeof value === "string") {
        return (value.startsWith("data:") && !isBase64DataUri(value)
            ? `data\\:${value.slice("data:".length)}`
            : value);
    }
    if (!value || typeof value !== "object")
        return value;
    if (seen.has(value))
        return "[Circular]";
    seen.add(value);
    if (Array.isArray(value)) {
        return value.map((item) => neutralizeLangfuseMediaPrefix(item, seen));
    }
    const output = {};
    for (const [key, item] of Object.entries(value)) {
        output[key] = neutralizeLangfuseMediaPrefix(item, seen);
    }
    return output;
}
function sanitizeBody(config, body) {
    return neutralizeLangfuseMediaPrefix(sanitizeForTelemetry(config, body));
}
function wrapTrace(config, trace) {
    return {
        id: trace.id,
        update(body) {
            trace.update(sanitizeBody(config, body));
        },
    };
}
function wrapSpan(config, span) {
    return {
        id: span.id,
        update(body) {
            span.update?.(sanitizeBody(config, body));
        },
        end(body) {
            span.end(sanitizeBody(config, body));
        },
    };
}
function wrapGeneration(config, generation) {
    return {
        id: generation.id,
        update(body) {
            generation.update?.(sanitizeBody(config, body));
        },
        end(body) {
            generation.end(sanitizeBody(config, body));
        },
    };
}
function wrapClient(config, rawClient) {
    return {
        trace(body) {
            return wrapTrace(config, rawClient.trace(sanitizeBody(config, body)));
        },
        span(body) {
            return wrapSpan(config, rawClient.span(sanitizeBody(config, body)));
        },
        generation(body) {
            return wrapGeneration(config, rawClient.generation(sanitizeBody(config, body)));
        },
        score(body) {
            rawClient.score(sanitizeBody(config, body));
        },
        flushAsync: rawClient.flushAsync?.bind(rawClient),
        shutdownAsync: rawClient.shutdownAsync.bind(rawClient),
    };
}
export async function flushClient() {
    if (client?.flushAsync) {
        await client.flushAsync();
    }
}
export async function shutdownClient() {
    if (client) {
        await client.shutdownAsync();
        client = null;
        clientConfigKey = "";
    }
}
export async function getClient(config) {
    const nextConfigKey = JSON.stringify({
        publicKey: config.publicKey,
        secretKey: config.secretKey,
        host: config.host,
    });
    if (client && clientConfigKey !== nextConfigKey) {
        await shutdownClient();
    }
    if (!client) {
        client = new Langfuse({
            publicKey: config.publicKey,
            secretKey: config.secretKey,
            baseUrl: config.host,
        });
        clientConfigKey = nextConfigKey;
    }
    return wrapClient(config, client);
}
//# sourceMappingURL=langfuse-client.js.map