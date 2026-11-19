import { PRODUCT_EVENTS } from "@formulate/analytics";
import {
  assign,
  parseExperimentId,
  parsePayload,
  payloadUrl,
  type Assignment,
  type ExperimentDefinition,
  type FeatureApiResponse,
  type VariantOf,
} from "@formulate/experiments";
import { useEffect, useRef, useState } from "react";

import { analytics, analyticsDistinctId } from "./product-analytics";
import { useTrackingConsent } from "./tracking-consent";

/**
 * A/B tests in the app (ADR 0013), the app's half of apps/web/lib/experiments.ts:
 * the same experiments, settings and rules. The id is the app's own PostHog
 * anonymous id, so a shopper who uses web and the app counts as two visitors.
 *
 * Only shoppers who accepted tracking take part. Without consent there is no
 * id, `assign` returns the control and nothing is recorded.
 *
 * ⚠️ The variant is decided on the device, after the screen first renders, so
 * the screen starts on the control. For the A/A test that changes nothing;
 * a real experiment that changes what the screen shows should hold its
 * variant's part back until `decided` is true, so the shopper never sees one
 * version swap for another.
 *
 * The key is `EXPO_PUBLIC_`: it's compiled into the app, which is fine, since
 * GrowthBook's client keys only read published settings. Use the `production`
 * environment's key for builds people use.
 */
const CLIENT_KEY = process.env.EXPO_PUBLIC_GROWTHBOOK_CLIENT_KEY ?? "";

/** How long fetched settings are reused, as on web. */
const PAYLOAD_TTL_MS = 60_000;

/** A slow CDN must not hold the screen: past this, it's the control. */
const PAYLOAD_TIMEOUT_MS = 1_500;

let cached: {
  readonly at: number;
  readonly payload: Promise<FeatureApiResponse | null>;
} | null = null;

/** One fetch of GrowthBook's settings; null on any failure, a timeout included. */
const fetchPayload = async (): Promise<FeatureApiResponse | null> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PAYLOAD_TIMEOUT_MS);
  try {
    const response = await fetch(payloadUrl(CLIENT_KEY), { signal: controller.signal });
    return response.ok ? parsePayload(await response.json()) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
};

/**
 * GrowthBook's settings, fetched at most once a minute. A failure isn't kept
 * for the minute: the next screen tries again.
 */
const loadPayload = async (): Promise<FeatureApiResponse | null> => {
  if (!CLIENT_KEY) return null;
  const now = Date.now();
  if (cached && now - cached.at < PAYLOAD_TTL_MS) return cached.payload;
  const payload = fetchPayload();
  cached = { at: now, payload };
  const result = await payload;
  if (result === null && cached?.payload === payload) cached = null;
  return result;
};

export interface ExperimentState<V extends string> extends Assignment<V> {
  /** False until the variant has been decided for this shopper. */
  readonly decided: boolean;
}

/**
 * The variant this shopper sees, and the exposure sent once it's decided.
 *
 * `forced` is a variant name from the screen's route parameters
 * (`/products/x?product-page-aa=control-copy`, as on web), for review and
 * demos. It is shown and never recorded.
 *
 * `experiment_viewed` goes out once per screen per variant, and only if the
 * shopper's id is still the one the variant was decided for: a withdrawal in
 * the meantime deletes the id, and a new one must not be credited with it.
 */
export const useExperiment = <D extends ExperimentDefinition>(
  definition: D,
  forced?: string | string[] | null,
): ExperimentState<VariantOf<D>> => {
  const consent = useTrackingConsent();
  const forcedVariant = typeof forced === "string" ? forced : null;
  const [state, setState] = useState<ExperimentState<VariantOf<D>>>({
    variant: definition.variants[0],
    exposure: null,
    decided: false,
  });
  const sent = useRef<string | null>(null);

  useEffect(() => {
    let current = true;
    const id = consent === "granted" ? parseExperimentId(analyticsDistinctId()) : null;
    void (async () => {
      const assignment = await assign(definition, {
        payload: id ? await loadPayload() : null,
        id,
        forced: forcedVariant,
      });
      if (!current) return;
      setState({ ...assignment, decided: true });

      const exposure = assignment.exposure;
      if (!exposure || !id) return;
      const key = `${exposure.experiment_key}:${exposure.variation_id}`;
      if (sent.current === key || analyticsDistinctId() !== id) return;
      sent.current = key;
      analytics()?.capture(PRODUCT_EVENTS.experimentViewed, {
        experiment_key: exposure.experiment_key,
        variation_id: exposure.variation_id,
      });
    })();
    return () => {
      current = false;
    };
  }, [definition, consent, forcedVariant]);

  return state;
};
