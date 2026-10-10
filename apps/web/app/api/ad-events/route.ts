import {
  parseAdEvent,
  toMetaServerEvent,
  toPinterestServerEvent,
  toSnapServerEvent,
  toTikTokServerEvent,
  type AdEvent,
  type ServerContext,
} from "@formulate/analytics";
import { cookies, headers } from "next/headers";

import { CONSENT_COOKIE, parseConsent } from "@/lib/consent";

/**
 * Server-side copies of the storefront's commerce events, for the platforms
 * with a conversions API: Meta, TikTok, Pinterest and Snapchat. They still
 * count when the browser tag is blocked by an ad blocker or Safari's tracking
 * protection. Each copy shares the browser event's id, so the platform keeps
 * one of the two.
 *
 * ⚠️ Public, like every pixel endpoint: anyone can post here. So:
 * - nothing is forwarded without the tracking-consent cookie;
 * - the body is size-limited and rebuilt field by field (`parseAdEvent`), so
 *   only the storefront's own event shape reaches a platform;
 * - the caller always gets 204, never a platform's response.
 *
 * Every token is a secret (Vercel, type Sensitive). A platform without its
 * id and token is skipped.
 */
const MAX_BODY_BYTES = 16_384;

const done = () => new Response(null, { status: 204 });

type Context = ServerContext & { readonly fbp?: string; readonly fbc?: string };

interface Outgoing {
  readonly url: string;
  readonly headers: Record<string, string>;
  readonly body: unknown;
}

interface Destination {
  readonly name: string;
  /** The request to send, or null when unconfigured or the event doesn't apply. */
  readonly request: (event: AdEvent, context: Context) => Outgoing | null;
}

const env = (name: string) => process.env[name] ?? "";

const DESTINATIONS: readonly Destination[] = [
  {
    name: "meta",
    request: (event, context) => {
      const pixel = env("NEXT_PUBLIC_META_PIXEL_ID");
      const token = env("META_CAPI_TOKEN");
      if (!pixel || !token) return null;
      const test = env("META_TEST_EVENT_CODE");
      return {
        url: `https://graph.facebook.com/v26.0/${encodeURIComponent(pixel)}/events`,
        headers: { authorization: `Bearer ${token}` },
        // A test code routes events to Events Manager's "Test events" tab.
        body: {
          data: [toMetaServerEvent(event, context)],
          ...(test ? { test_event_code: test } : {}),
        },
      };
    },
  },
  {
    name: "tiktok",
    request: (event, context) => {
      const pixel = env("NEXT_PUBLIC_TIKTOK_PIXEL_ID");
      const token = env("TIKTOK_EVENTS_TOKEN");
      if (!pixel || !token) return null;
      const test = env("TIKTOK_TEST_EVENT_CODE");
      return {
        url: "https://business-api.tiktok.com/open_api/v1.3/event/track/",
        headers: { "access-token": token },
        body: {
          event_source: "web",
          event_source_id: pixel,
          data: [toTikTokServerEvent(event, context)],
          ...(test ? { test_event_code: test } : {}),
        },
      };
    },
  },
  {
    name: "pinterest",
    request: (event, context) => {
      const account = env("PINTEREST_AD_ACCOUNT_ID");
      const token = env("PINTEREST_CAPI_TOKEN");
      const payload = toPinterestServerEvent(event, context);
      if (!account || !token || !payload) return null;
      // `?test=true` sends to Pinterest's sandbox: validated, never reported.
      const test = env("PINTEREST_TEST_MODE") === "true" ? "?test=true" : "";
      return {
        url: `https://api.pinterest.com/v5/ad_accounts/${encodeURIComponent(account)}/events${test}`,
        headers: { authorization: `Bearer ${token}` },
        body: { data: [payload] },
      };
    },
  },
  {
    name: "snapchat",
    request: (event, context) => {
      const pixel = env("NEXT_PUBLIC_SNAP_PIXEL_ID");
      const token = env("SNAP_CAPI_TOKEN");
      if (!pixel || !token) return null;
      // Snap takes the token as a query parameter. It never leaves this server.
      return {
        url: `https://tr.snapchat.com/v3/${encodeURIComponent(pixel)}/events?access_token=${encodeURIComponent(token)}`,
        headers: {},
        body: { data: [toSnapServerEvent(event, context)] },
      };
    },
  },
];

export const POST = async (request: Request): Promise<Response> => {
  const jar = await cookies();
  if (parseConsent(jar.get(CONSENT_COOKIE)?.value) !== "granted") return done();

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return done();

  let event: AdEvent | null;
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
  const context: Context = {
    eventTime: Math.floor(Date.now() / 1000),
    sourceUrl: referer.split(/[?#]/, 1)[0] ?? "",
    userAgent: incoming.get("user-agent") ?? "",
    // Vercel sets x-forwarded-for; its first entry is the client.
    ipAddress: incoming.get("x-forwarded-for")?.split(",")[0]?.trim() || undefined,
    fbp: jar.get("_fbp")?.value,
    fbc: jar.get("_fbc")?.value,
    cookies: {
      ttp: jar.get("_ttp")?.value,
      epik: jar.get("_epik")?.value,
      scid: jar.get("_scid")?.value,
    },
  };

  const parsed = event;
  await Promise.allSettled(
    DESTINATIONS.map(async ({ name, request: build }) => {
      const outgoing = build(parsed, context);
      if (!outgoing) return;
      const response = await fetch(outgoing.url, {
        method: "POST",
        headers: { "content-type": "application/json", ...outgoing.headers },
        body: JSON.stringify(outgoing.body),
      }).catch(() => null);
      if (!response?.ok) {
        // Platform and status only: an error body can echo the request.
        console.error("ad conversions api failed", {
          platform: name,
          status: response?.status ?? "network",
        });
      }
    }),
  );

  return done();
};
