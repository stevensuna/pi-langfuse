import { LangfuseSpanProcessor } from "@langfuse/otel";
import {
	LangfuseOtelSpanAttributes,
	propagateAttributes,
	setLangfuseTracerProvider,
	startObservation,
} from "@langfuse/tracing";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import type { Config } from "./config.js";
import { sanitizeForTelemetry } from "./redaction.js";

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
type NativeObservation = {
	id: string;
	traceId: string;
	end(): void;
	updateOtelSpanAttributes(attributes: Record<string, unknown>): void;
	startObservation(
		name: string,
		attributes: Record<string, unknown>,
		options?: { asType?: "span" | "generation" },
	): NativeObservation;
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
type TraceUpdate = Body & Partial<TraceAttributes> & { environment?: string };

export interface LangfuseTrace {
	id: string;
	update(body?: TraceUpdate): void;
}
export interface LangfuseSpan {
	id: string;
	update?(body: Body): void;
	end(body?: Body): void;
}
export interface LangfuseGeneration extends LangfuseSpan {}

type TraceState = { root: NativeObservation; attributes: TraceAttributes };
let provider: NodeTracerProvider | null = null;
let processor: LangfuseSpanProcessor | null = null;
let configKey = "";
const traces = new Map<string, TraceState>();
const observations = new Map<string, NativeObservation>();

function sanitize<T>(config: Config, value: T): T {
	return sanitizeForTelemetry(config, value);
}

function traceTelemetryAttributes(
	attributes?: TraceAttributes,
): Record<string, unknown> {
	if (!attributes) return {};
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

function observationAttributes(
	config: Config,
	body?: Body,
	traceAttributes?: TraceAttributes,
): Record<string, unknown> {
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

function propagatedAttributes(attributes: TraceAttributes) {
	return {
		...attributes,
		metadata: attributes.metadata
			? Object.fromEntries(
					Object.entries(attributes.metadata).flatMap(([key, value]) => {
						if (value === undefined || value === null) return [];
						const text =
							typeof value === "string" ? value : JSON.stringify(value);
						if (text === undefined) return [];
						return [[key, text.slice(0, 200)]];
					}),
				)
			: undefined,
	};
}

function update(
	observation: NativeObservation,
	config: Config,
	body?: Body,
	traceAttributes?: TraceAttributes,
) {
	if (!body) return;
	observation.updateOtelSpanAttributes(
		observationAttributes(config, body, traceAttributes),
	);
}

function wrapObservation(
	observation: NativeObservation,
	config: Config,
	traceAttributes: TraceAttributes,
): LangfuseSpan {
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
	if (provider) await provider.shutdown();
	provider = null;
	processor = null;
	configKey = "";
	traces.clear();
	observations.clear();
	setLangfuseTracerProvider(null);
}

function ensureClient(config: Config) {
	const nextKey = JSON.stringify([
		config.publicKey,
		config.secretKey,
		config.host,
	]);
	if (provider && configKey === nextKey) return;
	if (provider)
		throw new Error(
			"Langfuse configuration changed during an active Pi session",
		);
	processor = new LangfuseSpanProcessor({
		publicKey: config.publicKey,
		secretKey: config.secretKey,
		baseUrl: config.host,
		environment: config.environment,
		release: config.release || undefined,
		exportMode: "immediate",
		mask: ({ data }: { data: unknown }) => sanitizeForTelemetry(config, data),
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

export async function getClient(config: Config) {
	ensureClient(config);
	return {
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
		}) {
			const safe = sanitize(config, body);
			const attributes: TraceAttributes = {
				traceName: safe.name,
				metadata: safe.metadata,
				sessionId: safe.sessionId,
				userId: safe.userId,
				tags: safe.tags,
				release: safe.release,
				version: safe.version,
			};
			const root = propagateAttributes(propagatedAttributes(attributes), () =>
				startObservation(
					safe.name,
					observationAttributes(config, safe, attributes),
					{
						asType: "span",
					},
				),
			) as unknown as NativeObservation;
			traces.set(root.traceId, { root, attributes });
			observations.set(root.id, root);
			return {
				id: root.traceId,
				update(updateBody: TraceUpdate) {
					const state = traces.get(root.traceId);
					if (!state || !updateBody) return;
					state.attributes = {
						...state.attributes,
						...sanitize(config, updateBody),
					};
					update(root, config, updateBody, state.attributes);
					// The legacy extension finalizes a prompt by updating its trace output.
					// In OTel the root observation must be ended for the exporter to emit
					// the complete hierarchy to the v4 events pipeline.
					if (updateBody.output !== undefined) root.end();
				},
			};
		},
		span(
			body: {
				name: string;
				traceId: string;
				parentObservationId?: string;
			} & Body,
		) {
			const state = traces.get(body.traceId);
			const parent =
				(body.parentObservationId &&
					observations.get(body.parentObservationId)) ||
				state?.root;
			if (!state || !parent)
				throw new Error("Langfuse parent observation was not found");
			const child = propagateAttributes(
				propagatedAttributes(state.attributes),
				() =>
					parent.startObservation(
						body.name,
						observationAttributes(config, body, state.attributes),
						{ asType: "span" },
					),
			);
			return wrapObservation(child, config, state.attributes);
		},
		generation(
			body: {
				name: string;
				traceId: string;
				parentObservationId?: string;
			} & Body,
		) {
			const state = traces.get(body.traceId);
			const parent =
				(body.parentObservationId &&
					observations.get(body.parentObservationId)) ||
				state?.root;
			if (!state || !parent)
				throw new Error("Langfuse parent observation was not found");
			const child = propagateAttributes(
				propagatedAttributes(state.attributes),
				() =>
					parent.startObservation(
						body.name,
						observationAttributes(config, body, state.attributes),
						{ asType: "generation" },
					),
			);
			return wrapObservation(
				child,
				config,
				state.attributes,
			) as LangfuseGeneration;
		},
	};
}
