import { isPreviewToken } from "@/lib/campaign";

/**
 * Checks a preview token for the app (SHO-169), so the secret lives only here
 * and never in the app's bundle. Body: the token as plain text. 204 if right,
 * 403 if not; nothing else is said.
 */
export const POST = async (request: Request) => {
  const token = (await request.text()).slice(0, 256).trim();
  return new Response(null, {
    status: isPreviewToken(token) ? 204 : 403,
    headers: { "cache-control": "no-store" },
  });
};
