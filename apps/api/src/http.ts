/**
 * The responses every route shares.
 *
 * ⚠️ The only outcomes a caller ever sees. Klaviyo's and Shopify's error
 * bodies describe the account — a wrong list id says "List not found", which
 * tells a prober something true about our configuration. Forwarding an
 * upstream error would turn a route into an information-disclosure endpoint,
 * so a route logs the detail and answers with one of these.
 *
 * Note this is the exact opposite of what the client surfaces do, where
 * surfacing Klaviyo's error body was the right call and saved hours of
 * debugging. The code would be identical; the recipient is not. Error
 * verbosity should scale with the trust of whoever receives it.
 */
export type Outcome =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly reason: "invalid-email" | "rate-limited" | "rejected";
    };

export const json = (body: Outcome, status: number): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      /*
       * ⚠️ No CORS headers, deliberately. Do not add them.
       *
       * A native app is not subject to CORS, so this Worker's intended callers
       * need none. Their absence means a browser cannot use a route from
       * another origin: an `application/json` POST requires a preflight, and
       * the preflight fails without `Access-Control-Allow-Origin`.
       *
       * That is a free control. Adding permissive CORS to "fix" a problem
       * nobody has would hand every website on the internet a working
       * subscribe endpoint pointed at our list.
       */
      "cache-control": "no-store",
    },
  });
