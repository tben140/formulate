/**
 * The visitor's country, from Vercel's IP geolocation.
 *
 * Used by `lib/klaviyo.ts` to decide whether events fired before the tracking
 * choice may wait in memory (US visitors) or are dropped (everyone else). See
 * `holdsEventsBeforeChoice` there.
 *
 * Nothing is stored: no cookie, no log line. The country is worked out from
 * the request's IP address, which every page request already sends.
 * Off Vercel (local development, CI) the header is missing and the answer is
 * `null`, which counts as "not the US".
 */
export const GET = (request: Request): Response => {
  const header = request.headers.get("x-vercel-ip-country");
  const country = header && /^[A-Z]{2}$/.test(header) ? header : null;
  return Response.json(
    { country },
    { headers: { "Cache-Control": "private, no-store" } },
  );
};
