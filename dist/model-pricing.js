import { existsSync, readFileSync, statSync } from "node:fs";
let cache;
function normalized(value) {
    return (value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}
function numberAt(value) {
    return typeof value === "number" && Number.isFinite(value) && value >= 0
        ? value
        : undefined;
}
function loadCatalog(path) {
    if (!path || !existsSync(path))
        return undefined;
    try {
        const modifiedMs = statSync(path).mtimeMs;
        if (!cache || cache.path !== path || cache.modifiedMs !== modifiedMs) {
            const parsed = JSON.parse(readFileSync(path, "utf-8"));
            if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
                return undefined;
            cache = {
                path,
                modifiedMs,
                catalog: parsed,
            };
        }
        return {
            catalog: cache.catalog,
            retrievedAt: new Date(cache.modifiedMs).toISOString(),
        };
    }
    catch {
        return undefined;
    }
}
export function estimateCostFromModelsDev(options) {
    const catalog = loadCatalog(options.catalogPath);
    const provider = normalized(options.provider);
    const model = normalized(options.model);
    if (!catalog || !model)
        return undefined;
    for (const [providerKey, providerData] of Object.entries(catalog.catalog)) {
        if (provider && normalized(providerKey) !== provider)
            continue;
        for (const [modelKey, modelData] of Object.entries(providerData.models || {})) {
            const identifiers = [modelKey, modelData.id, modelData.name]
                .filter((value) => typeof value === "string")
                .map(normalized);
            if (!identifiers.includes(model))
                continue;
            const baseCost = modelData.cost;
            const tiers = Array.isArray(baseCost?.tiers) ? baseCost.tiers : [];
            const inputTokens = (options.input || 0) +
                (options.cacheRead || 0) +
                (options.cacheWrite || 0);
            const cost = tiers
                .filter((tier) => !!tier && typeof tier === "object" && !Array.isArray(tier))
                .filter((tier) => {
                const condition = tier.tier;
                return (condition?.type === "context" &&
                    typeof condition.size === "number" &&
                    inputTokens > condition.size);
            })
                .sort((left, right) => Number(right.tier.size) -
                Number(left.tier.size))[0] ?? baseCost;
            const inputRate = numberAt(cost?.input);
            const outputRate = numberAt(cost?.output);
            if (inputRate === undefined || outputRate === undefined)
                return undefined;
            const cacheReadRate = numberAt(cost?.cache_read) ?? inputRate;
            const cacheWriteRate = numberAt(cost?.cache_write) ?? inputRate;
            const details = {
                input: ((options.input || 0) * inputRate) / 1_000_000,
                cache_read_input_tokens: ((options.cacheRead || 0) * cacheReadRate) / 1_000_000,
                cache_creation_input_tokens: ((options.cacheWrite || 0) * cacheWriteRate) / 1_000_000,
                output: ((options.output || 0) * outputRate) / 1_000_000,
            };
            return {
                details: {
                    ...details,
                    total: Object.values(details).reduce((sum, value) => sum + value, 0),
                },
                source: "models.dev",
                retrievedAt: catalog.retrievedAt,
            };
        }
    }
    return undefined;
}
//# sourceMappingURL=model-pricing.js.map