import { parseAdEvent, toMetaServerEvent } from "@formulate/analytics";
import { cookies, headers } from "next/headers";

import { CONSENT_COOKIE, parseConsent } from "@/lib/consent";

/**
 * Meta's Conversions API: the server-side copy of each commerce event the
 * browser sends to the Pixel. It still counts when the Pixel is blocked by an
 * ad blocker or Safari's tracking protection. The shared `event_id` stops
 * Meta counting an event twice when both arrive.
 *
 * ⚠️ Public, like every pixel endpoint: anyone can post here. So:
 * - nothing is forwarded without the tracking-consent cookie;
 * - the body is size-limited and rebuilt field by field (`parseAdEvent`), so
 *   only the storefront's own event shape reaches Meta;
 * - the caller always gets 204, never Meta's response.
 *
 * `META_CAPI_TOKEN` is a secret (Vercel, type Sensitive). Without it, or the
 * pixel id, the route does nothing.
 */
const GRAPH_VERSION = "v26.0";
const MAX_BODY_BYTES = 16_384;

const done = () => new Response(null, { status: 204 });

export const POST = async (request: Request): Promise<Response> => {
  const pixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID;
  const token = process.env.META_CAPI_TOKEN;
  if (!pixelId || !token) return done();

  const jar = await cookies();
  if (parseConsent(jar.get(CONSENT_COOKIE)?.value) !== "granted") return done();

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return done();

  let event;
  try {
    event = parseAdEvent(JSON.parse(raw));
  } catch {
    return done();
  }
  if (!event) return done();

  const incoming = await headers();
  // The page the event happened on, without its query string (search terms,
  // sign-in codes). Same-origin requests always carry a Referer here.
  const referer = incoming.get("referer") ?? "";
  const sourceUrl = referer.split(/[?#]/, 1)[0] ?? "";

  const body = {
    data: [
      toMetaServerEvent(event, {
        eventTime: Math.floor(Date.now() / 1000),
        sourceUrl,
        userAgent: incoming.get("user-agent") ?? "",
        // Vercel sets x-forwarded-for; its first entry is the client.
        ipAddress: incoming.get("x-forwarded-for")?.split(",")[0]?.trim() || undefined,
        fbp: jar.get("_fbp")?.value,
        fbc: jar.get("_fbc")?.value,
      }),
    ],
    // Routes events to Events Manager's "Test events" tab while verifying.
    ...(process.env.META_TEST_EVENT_CODE
      ? { test_event_code: process.env.META_TEST_EVENT_CODE }
      : {}),
  };

  const response = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(pixelId)}/events`,
    {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    },
  ).catch(() => null);

  if (!response?.ok) {
    // Status only: Meta's error body can echo the request.
    console.error("meta conversions api failed", {
      status: response?.status ?? "network",
    });
  }
  return done();
};
