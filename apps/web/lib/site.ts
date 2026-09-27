/**
 * Where this deployment lives, and whether search engines may index it.
 *
 * ⚠️ Indexing is opt-in, and only Vercel **production** opts in. Preview
 * deployments are public URLs that serve the same content as production; if
 * they were indexable, search engines would find the same products at dozens
 * of throwaway addresses and split ranking between them. Local dev and CI are
 * not indexable either, so nothing but production can ever emit `index`.
 *
 * `VERCEL_ENV` is set by Vercel on every deployment: "production", "preview"
 * or "development". It is absent everywhere else, which reads as "not
 * production" — the safe direction to fail in.
 */
export const isIndexable = process.env.VERCEL_ENV === "production";

/**
 * The absolute origin every canonical URL, Open Graph URL and sitemap entry is
 * built from.
 *
 * `SITE_URL` wins when set, for a custom domain. Otherwise production uses
 * Vercel's production domain, so a preview's canonicals point at production
 * rather than at itself. That is the correct direction for a preview: it tells
 * a crawler that finds it anyway which address is the real one.
 */
const resolveSiteUrl = (): URL => {
  const explicit = process.env.SITE_URL;
  if (explicit) return new URL(explicit);

  const production = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (production) return new URL(`https://${production}`);

  return new URL(`http://localhost:${process.env.PORT ?? "3000"}`);
};

export const siteUrl = resolveSiteUrl();

/** An absolute URL on this site, for places that do not accept relative ones. */
export const absoluteUrl = (path: string): string => new URL(path, siteUrl).toString();

export const SITE_NAME = "Formulate";
