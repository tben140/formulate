/**
 * Product reviews from Judge.me (v1, chosen 2026-10-09), for web and the app.
 *
 *   POST /reviews  { "handle": "magnesium-glycinate", "page": 1 }
 *
 * Public and read-only: anyone may read a product's published reviews, the
 * same as on Judge.me's own widget. The Worker exists so the **private** token
 * never reaches a browser or an app bundle (Judge.me can't regenerate it if it
 * leaks; only their support can), and so the response can be cut down.
 *
 * ⚠️ Judge.me's review objects carry the reviewer's email, phone and marketing
 * status. Only the fields in `PublicReview` (packages/shopify reviews.ts) are
 * copied out, by name, and the name itself is shortened to "Sam T.". Never
 * return a Judge.me object as it arrived.
 */

export interface ReviewsEnv {
  /** Plain var: the store's *.myshopify.com domain, Judge.me's shop key. */
  readonly SHOPIFY_STORE_DOMAIN: string;
  /** Secret. Judge.me → Settings → Integrations → View API tokens → private. */
  readonly JUDGEME_PRIVATE_TOKEN?: string;
  /** Test overrides only. */
  readonly JUDGEME_API_URL?: string;
}

const JUDGEME_API = "https://judge.me/api/v1";
const PER_PAGE = 10;
/** Reviews change rarely; ten minutes keeps Judge.me calls low and pages fast. */
const CACHE_SECONDS = 600;

/** Product handles: what Shopify allows, nothing that could reshape a URL. */
const HANDLE = /^[a-z0-9][a-z0-9-]{0,254}$/;

/** Matches PublicReview in packages/shopify/src/reviews.ts. */
interface PublicReview {
  readonly id: number;
  readonly rating: number;
  readonly title: string | null;
  readonly body: string;
  readonly author: string;
  readonly createdAt: string;
  readonly verifiedBuyer: boolean;
  readonly pictures: readonly string[];
  readonly sample: boolean;
}

export type ReviewsResult =
  | {
      readonly status: number;
      readonly body: {
        readonly ok: true;
        readonly reviews: readonly PublicReview[];
        readonly page: number;
        readonly hasMore: boolean;
      };
    }
  | {
      readonly status: number;
      readonly body: {
        readonly ok: false;
        readonly reason: "rejected" | "not-configured" | "unavailable";
      };
    };

const fail = (
  status: number,
  reason: "rejected" | "not-configured" | "unavailable",
): ReviewsResult => ({ status, body: { ok: false, reason } });

/** "Sam Taylor" → "Sam T.", as reviewerDisplayName in packages/shopify. */
const displayName = (name: unknown): string => {
  const parts = (typeof name === "string" ? name : "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "Anonymous";
  const [first, ...rest] = parts;
  const last = rest.at(-1);
  return last ? `${first} ${last[0]?.toUpperCase()}.` : (first ?? "Anonymous");
};

/**
 * Sample reviews written for the demo store are shown as samples everywhere
 * (the DMCC Act 2024 makes presenting invented reviews as genuine unlawful).
 *
 * Two signals, either enough: the reviewer is tagged `sample` in Judge.me, or
 * their email is at one of the reserved example domains (RFC 2606), which no
 * real customer can have. The second matters because Judge.me's create-review
 * API can't set tags, so samples created through it carry an example address.
 */
const SAMPLE_EMAIL = /@example\.(com|org|net)$/i;

const isSample = (reviewer: Record<string, unknown> | undefined): boolean =>
  (typeof reviewer?.tags === "string" &&
    reviewer.tags
      .split(",")
      .map((tag) => tag.trim().toLowerCase())
      .includes("sample")) ||
  (typeof reviewer?.email === "string" && SAMPLE_EMAIL.test(reviewer.email.trim()));

const pictureUrls = (pictures: unknown): string[] =>
  (Array.isArray(pictures) ? pictures : []).flatMap((picture) => {
    const urls = (picture as { urls?: Record<string, unknown> })?.urls ?? {};
    const url = urls.huge ?? urls.original ?? urls.compact ?? Object.values(urls)[0];
    return typeof url === "string" && url.startsWith("https://") ? [url] : [];
  });

/** The fields a page may show, and only those. Exported for tests. */
export const toPublicReview = (review: Record<string, unknown>): PublicReview | null => {
  const rating = Number(review.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return null;
  // Published, not hidden, not marked spam: what Judge.me's own widget shows.
  if (review.published === false || review.hidden === true || review.curated === "spam") {
    return null;
  }
  const reviewer = review.reviewer as Record<string, unknown> | undefined;
  return {
    id: Number(review.id),
    rating,
    title:
      typeof review.title === "string" && review.title.trim()
        ? review.title.trim()
        : null,
    body: typeof review.body === "string" ? review.body.trim() : "",
    author: displayName(reviewer?.name),
    createdAt: typeof review.created_at === "string" ? review.created_at : "",
    verifiedBuyer: review.verified === "buyer" || review.verified === "verified-purchase",
    pictures: pictureUrls(review.pictures),
    sample: isSample(reviewer),
  };
};

const judgeme = async (env: ReviewsEnv, path: string, params: Record<string, string>) => {
  const url = new URL(`${env.JUDGEME_API_URL ?? JUDGEME_API}${path}`);
  url.search = new URLSearchParams({
    shop_domain: env.SHOPIFY_STORE_DOMAIN,
    api_token: env.JUDGEME_PRIVATE_TOKEN ?? "",
    ...params,
  }).toString();
  const response = await fetch(url, { headers: { accept: "application/json" } });
  return {
    status: response.status,
    body: (await response.json().catch(() => null)) as Record<string, unknown> | null,
  };
};

export const listReviews = async (
  env: ReviewsEnv,
  raw: string,
): Promise<ReviewsResult> => {
  let handle: unknown;
  let page: unknown;
  try {
    ({ handle, page } = JSON.parse(raw) as { handle?: unknown; page?: unknown });
  } catch {
    return fail(400, "rejected");
  }
  if (typeof handle !== "string" || !HANDLE.test(handle)) return fail(400, "rejected");
  const pageNumber = page === undefined ? 1 : Number(page);
  if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > 100) {
    return fail(400, "rejected");
  }
  if (!env.JUDGEME_PRIVATE_TOKEN) {
    console.error("reviews: JUDGEME_PRIVATE_TOKEN is not set");
    return fail(503, "not-configured");
  }

  // Judge.me keys reviews by its own product id, so the handle is resolved
  // first. A product it hasn't seen yet has no reviews: not an error.
  const product = await judgeme(env, "/products/-1", { handle });
  if (product.status === 404) {
    return {
      status: 200,
      body: { ok: true, reviews: [], page: pageNumber, hasMore: false },
    };
  }
  const productId = (product.body?.product as { id?: unknown } | undefined)?.id;
  if (product.status !== 200 || typeof productId !== "number") {
    console.error("judge.me product lookup failed", { status: product.status });
    return fail(502, "unavailable");
  }

  const list = await judgeme(env, "/reviews", {
    product_id: String(productId),
    page: String(pageNumber),
    per_page: String(PER_PAGE),
  });
  const reviews = list.body?.reviews;
  if (list.status !== 200 || !Array.isArray(reviews)) {
    console.error("judge.me reviews failed", { status: list.status });
    return fail(502, "unavailable");
  }

  return {
    status: 200,
    body: {
      ok: true,
      reviews: reviews.flatMap((review) => {
        const shown = toPublicReview(review as Record<string, unknown>);
        return shown ? [shown] : [];
      }),
      page: pageNumber,
      // A full page means there may be another; Judge.me doesn't say.
      hasMore: reviews.length === PER_PAGE,
    },
  };
};

/**
 * `listReviews` behind Cloudflare's cache, keyed by handle and page, so a
 * popular product page doesn't call Judge.me on every view. Errors aren't
 * cached. `caches` doesn't exist outside Workers (tests), so it's optional.
 */
export const cachedReviews = async (
  env: ReviewsEnv,
  raw: string,
): Promise<ReviewsResult> => {
  const store = (globalThis as { caches?: { default?: Cache } }).caches?.default;
  let key: Request | null = null;
  try {
    const { handle, page } = JSON.parse(raw) as { handle?: unknown; page?: unknown };
    if (typeof handle === "string" && HANDLE.test(handle)) {
      key = new Request(`https://reviews.cache/${handle}?page=${Number(page ?? 1)}`);
    }
  } catch {
    // listReviews rejects it below.
  }

  if (store && key) {
    const hit = await store.match(key);
    if (hit)
      return {
        status: 200,
        body: (await hit.json()) as ReviewsResult["body"],
      } as ReviewsResult;
  }
  const result = await listReviews(env, raw);
  if (store && key && result.body.ok) {
    await store.put(
      key,
      new Response(JSON.stringify(result.body), {
        headers: { "cache-control": `max-age=${CACHE_SECONDS}` },
      }),
    );
  }
  return result;
};

export const CACHE_MAX_AGE = CACHE_SECONDS;
