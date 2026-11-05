/**
 * App Bridge session tokens (SHO-205). The embedded page calls this Worker
 * with `Authorization: Bearer <token>`, a JWT Shopify signs with the app's
 * client secret (HS256). Verified here before anything else happens:
 * signature, audience (our client id), expiry and not-before (with a few
 * seconds' leeway for clock drift), and that the shop in `dest` matches the
 * one in `iss` and is the one shop this app serves.
 *
 * https://shopify.dev/docs/apps/build/authentication-authorization/session-tokens
 */

export interface Session {
  /** "tben140plus-xcorpito.myshopify.com" */
  readonly shop: string;
  /** The staff member's user id, for an online token. */
  readonly user: string | null;
  /** The raw token, for the token exchange. */
  readonly token: string;
}

const LEEWAY_S = 5;

const base64url = (text: string): Uint8Array => {
  const padded = text
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(text.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
};

const json = (part: string): Record<string, unknown> | null => {
  try {
    return JSON.parse(new TextDecoder().decode(base64url(part))) as Record<
      string,
      unknown
    >;
  } catch {
    return null;
  }
};

const host = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  try {
    return new URL(value).hostname;
  } catch {
    return null;
  }
};

/** The session in a bearer token, or null for anything that doesn't verify. */
export const verifySessionToken = async (
  token: string,
  options: { clientId: string; secret: string; shop: string; now?: Date },
): Promise<Session | null> => {
  const parts = token.split(".");
  if (parts.length !== 3 || !options.secret) return null;
  const [headerPart, payloadPart, signaturePart] = parts as [string, string, string];
  const header = json(headerPart);
  const payload = json(payloadPart);
  if (!header || !payload || header.alg !== "HS256") return null;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(options.secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  let signature: Uint8Array;
  try {
    signature = base64url(signaturePart);
  } catch {
    return null;
  }
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    signature,
    new TextEncoder().encode(`${headerPart}.${payloadPart}`),
  );
  if (!valid) return null;

  const now = Math.floor((options.now ?? new Date()).getTime() / 1000);
  const exp = Number(payload.exp);
  const nbf = Number(payload.nbf ?? 0);
  if (!Number.isFinite(exp) || exp + LEEWAY_S < now) return null;
  if (nbf - LEEWAY_S > now) return null;

  const audience = payload.aud;
  const audiences = Array.isArray(audience) ? audience : [audience];
  if (!audiences.includes(options.clientId)) return null;

  const dest = host(payload.dest);
  if (!dest || dest !== host(payload.iss) || dest !== options.shop) return null;

  return {
    shop: dest,
    user: typeof payload.sub === "string" ? payload.sub : null,
    token,
  };
};
