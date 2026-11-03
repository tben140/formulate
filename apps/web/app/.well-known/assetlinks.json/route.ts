import { APP_IDENTIFIERS } from "@formulate/shopify";

/**
 * Android App Links verification (SHO-63): proves this domain belongs to the
 * app, so Android opens product and collection links in it without asking.
 *
 * Needs the SHA-256 fingerprint of the app's signing certificate, which only
 * exists once EAS builds are set up (SHO-24): `eas credentials` shows it.
 * Until ANDROID_CERT_SHA256 is set this is a 404, and Android simply opens
 * links in the browser. Comma-separate more than one (upload and Play keys).
 */
export const GET = () => {
  const fingerprints = (process.env.ANDROID_CERT_SHA256 ?? "")
    .split(",")
    .map((value) => value.trim().toUpperCase())
    .filter((value) => /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(value));
  if (fingerprints.length === 0) return new Response("Not found", { status: 404 });

  return Response.json([
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: APP_IDENTIFIERS.android,
        sha256_cert_fingerprints: fingerprints,
      },
    },
  ]);
};
