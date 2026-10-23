import { APP_IDENTIFIERS, APP_LINK_PATHS } from "@formulate/shopify";

/**
 * iOS Universal Links association (SHO-63, used by SHO-85). Ready ahead of the
 * Apple Developer account, so turning Universal Links on is the app's
 * entitlement and nothing on web.
 *
 * Needs the Apple Team ID (APPLE_TEAM_ID, ten characters), which comes with
 * the paid membership. Until it's set this is a 404. Served as JSON with no
 * file extension, which is what iOS fetches.
 */
export const GET = () => {
  const teamId = (process.env.APPLE_TEAM_ID ?? "").trim();
  if (!/^[A-Z0-9]{10}$/.test(teamId)) return new Response("Not found", { status: 404 });

  return Response.json({
    applinks: {
      details: [
        {
          appIDs: [`${teamId}.${APP_IDENTIFIERS.ios}`],
          components: APP_LINK_PATHS.map((path) => ({ "/": path })),
        },
      ],
    },
  });
};
