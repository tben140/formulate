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
import { cookies } from "next/headers";
import { cache } from "react";

import { ANALYTICS_ID_COOKIE } from "./analytics-id";
import { CONSENT_COOKIE, parseConsent } from "./consent";

/**
 * A/B tests on web, decided on the server (ADR 0013). GrowthBook's SDK runs
 * here only, so the browser downloads none of it and the page never repaints
 * from the control into a variant.
 *
 * Only visitors who have accepted tracking take part: without consent there
 * is no id, and `assign` returns the control and records nothing.
 *
 * ⚠️ Server only: it reads request cookies. Not `NEXT_PUBLIC_`, on purpose.
 * The key isn't secret, but nothing in the browser needs it. Production uses
 * GrowthBook's `production` environment; previews and local work use `dev`, so
 * testing never counts towards real results.
 */
const CLIENT_KEY = process.env.GROWTHBOOK_CLIENT_KEY ?? "";

/** How long a fetched payload is reused. An experiment change shows within this. */
const PAYLOAD_REVALIDATE_SECONDS = 60;

/** A slow CDN must not hold the page: past this, everyone sees the control. */
const PAYLOAD_TIMEOUT_MS = 1_500;

/** The settings, fetched at most once per render and cached across requests. */
const loadPayload = cache(async (): Promise<FeatureApiResponse | null> => {
  if (!CLIENT_KEY) return null;
  try {
    const response = await fetch(payloadUrl(CLIENT_KEY), {
      next: { revalidate: PAYLOAD_REVALIDATE_SECONDS },
      signal: AbortSignal.timeout(PAYLOAD_TIMEOUT_MS),
    });
    return response.ok ? parsePayload(await response.json()) : null;
  } catch {
    return null;
  }
});

/**
 * The variant this request's visitor sees.
 *
 * `forced` is a variant name from the page's query string
 * (`?product-page-aa=control-copy`), for review and demos. It is shown and
 * never recorded.
 */
export const assignExperiment = async <D extends ExperimentDefinition>(
  definition: D,
  forced?: string | string[] | null,
): Promise<Assignment<VariantOf<D>>> => {
  const jar = await cookies();
  const consented = parseConsent(jar.get(CONSENT_COOKIE)?.value) === "granted";
  const id = consented ? parseExperimentId(jar.get(ANALYTICS_ID_COOKIE)?.value) : null;
  return assign(definition, {
    payload: id ? await loadPayload() : null,
    id,
    forced: typeof forced === "string" ? forced : null,
  });
};
