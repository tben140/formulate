/**
 * The files that let a link to this site open the app instead (universal
 * links on iOS, App Links on Android), served under `/.well-known/`.
 *
 * Both name the app by something only the developer accounts know: Apple's
 * Team ID, and the SHA-256 fingerprint of the Android signing certificate. So
 * each file is built from an environment variable, and is a 404 until that is
 * set. A file with a placeholder would be worse than none: the OS caches it and
 * treats the association as tried and failed.
 *
 * Only product and collection pages are claimed, the screens the app has. A
 * claimed path the app can't show would open a blank screen instead of the
 * page. The app's side is `associatedDomains` and `intentFilters` in
 * apps/mobile/app.config.ts, which must claim the same paths.
 */

/** The bundle id and Android package, as in apps/mobile/app.config.ts. */
export const APP_ID = "com.tben140.formulate";

/** The paths both platforms open in the app. */
export const APP_PATHS = ["/products/*", "/collections/*"] as const;

const json = (body: unknown): Response =>
  new Response(JSON.stringify(body), {
    headers: {
      "content-type": "application/json",
      "cache-control": "public, max-age=3600",
    },
  });

const notFound = (): Response => new Response("Not found", { status: 404 });

/** `APPLE_TEAM_ID`: ten characters, from Apple Developer → Membership. */
export const appleAppSiteAssociation = (): Response => {
  const team = process.env.APPLE_TEAM_ID?.trim();
  if (!team || !/^[A-Z0-9]{10}$/.test(team)) return notFound();
  return json({
    applinks: {
      details: [
        {
          appIDs: [`${team}.${APP_ID}`],
          components: APP_PATHS.map((path) => ({ "/": path })),
        },
      ],
    },
  });
};

/**
 * `ANDROID_CERT_SHA256`: the signing certificate's SHA-256, as
 * `AB:CD:…` (32 pairs). Several, comma-separated, while an old and a new key
 * are both in use. `eas credentials` shows it for the EAS-managed key.
 */
export const assetLinks = (): Response => {
  const fingerprints = (process.env.ANDROID_CERT_SHA256 ?? "")
    .split(",")
    .map((value) => value.trim().toUpperCase())
    .filter((value) => /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(value));
  if (fingerprints.length === 0) return notFound();
  return json([
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: APP_ID,
        sha256_cert_fingerprints: fingerprints,
      },
    },
  ]);
};
