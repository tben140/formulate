import { GrowthBookClient, type FeatureApiResponse } from "@growthbook/growthbook";

import type { ExperimentDefinition, VariantOf } from "./experiments";

export type { FeatureApiResponse };

/** GrowthBook Cloud's CDN. */
export const GROWTHBOOK_API_HOST = "https://cdn.growthbook.io";

/**
 * Where an SDK connection's settings are served. Each app fetches it with its
 * own `fetch`, so web can cache it the Next.js way and the app the React
 * Native way; this package never makes a request itself.
 */
export const payloadUrl = (clientKey: string): string =>
  `${GROWTHBOOK_API_HOST}/api/features/${encodeURIComponent(clientKey)}`;

/** A fetched body, or null when it isn't a GrowthBook payload. */
export const parsePayload = (body: unknown): FeatureApiResponse | null =>
  body !== null &&
  typeof body === "object" &&
  "features" in body &&
  typeof body.features === "object" &&
  body.features !== null
    ? (body as FeatureApiResponse)
    : null;

const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The experiment id, which is PostHog's anonymous id (ADR 0013), or null.
 * Anything that isn't a UUID is refused: the id arrives in a cookie, and a
 * hand-edited cookie must not choose its own bucket.
 */
export const parseExperimentId = (value: string | null | undefined): string | null =>
  value && UUID_SHAPE.test(value) ? value.toLowerCase() : null;

/**
 * What to record when a visitor is in an experiment: GrowthBook's experiment
 * tracking key and the variation's key, which the warehouse joins to orders.
 * Sent as the `experiment_viewed` event (packages/analytics).
 */
export interface Exposure {
  readonly experiment_key: string;
  readonly variation_id: string;
}

export interface Assignment<V extends string> {
  readonly variant: V;
  /** Null when nothing should be recorded: not in it, or forced. */
  readonly exposure: Exposure | null;
}

export interface AssignOptions {
  /** The GrowthBook payload, or null when it couldn't be fetched. */
  readonly payload: FeatureApiResponse | null;
  /** From parseExperimentId; null without consent. */
  readonly id: string | null;
  /**
   * A variant name forced for review or a demo. Shown, never recorded, so a
   * reviewer clicking through both arms doesn't count as two visitors.
   */
  readonly forced?: string | null;
}

/** One client per payload: building one parses every feature. */
const clients = new WeakMap<FeatureApiResponse, Promise<GrowthBookClient>>();

const clientFor = (payload: FeatureApiResponse): Promise<GrowthBookClient> => {
  let client = clients.get(payload);
  if (!client) {
    const created = new GrowthBookClient();
    client = created.setPayload(payload).then(() => created);
    clients.set(payload, client);
  }
  return client;
};

/**
 * Which variant this visitor sees.
 *
 * ⚠️ Every failure is the control, never an error: no payload, no id, an
 * unknown experiment, a rule that's off, a value we don't know. An experiment
 * must never break a page.
 */
export const assign = async <D extends ExperimentDefinition>(
  definition: D,
  { payload, id, forced }: AssignOptions,
): Promise<Assignment<VariantOf<D>>> => {
  const variants: readonly string[] = definition.variants;
  const control = { variant: definition.variants[0], exposure: null };

  if (forced && variants.includes(forced)) {
    return { variant: forced as VariantOf<D>, exposure: null };
  }
  if (!payload || !id) return control;

  try {
    const client = await clientFor(payload);
    const result = client.evalFeature<unknown>(definition.key, { attributes: { id } });
    const experiment = result.experiment;
    const outcome = result.experimentResult;
    if (
      result.source !== "experiment" ||
      !experiment ||
      !outcome?.inExperiment ||
      typeof result.value !== "string" ||
      !variants.includes(result.value)
    ) {
      return control;
    }
    return {
      variant: result.value as VariantOf<D>,
      exposure: { experiment_key: experiment.key, variation_id: outcome.key },
    };
  } catch {
    return control;
  }
};
