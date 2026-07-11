export type EstimatedCost = {
    details: Record<string, number>;
    source: "models.dev";
    retrievedAt: string;
};
export declare function estimateCostFromModelsDev(options: {
    catalogPath: string;
    provider?: string;
    model?: string;
    input?: number;
    output?: number;
    cacheRead?: number;
    cacheWrite?: number;
}): EstimatedCost | undefined;
//# sourceMappingURL=model-pricing.d.ts.map