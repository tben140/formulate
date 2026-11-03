/**
 * "Edit my blend" (custom daily pack): the subscription's ingredients live in
 * its Recharge properties, `_blend` (codes, e.g. `d3,k2,mg`) and `Blend`
 * (words, as the warehouse reads them). See packages/shopify/src/blend.ts on
 * the storefront side.
 *
 * The range comes from the store's `blend_ingredient` metaobjects, read with
 * the public Storefront token (`SHOPIFY_STOREFRONT_TOKEN`, a Worker secret so
 * it stays out of the repo). Without it, editing a blend answers
 * "not-configured" and everything else still works.
 */

export interface BlendEnv {
  readonly SHOPIFY_STORE_DOMAIN?: string;
  readonly SHOPIFY_API_VERSION: string;
  readonly SHOPIFY_STOREFRONT_TOKEN?: string;
}

export interface BlendOption {
  readonly code: string;
  readonly name: string;
  readonly shortName: string;
}

export const BLEND_CODES_KEY = "_blend";
export const BLEND_LABEL_KEY = "Blend";

const CODE = /^[a-z0-9]{1,12}$/;

type Property = { name?: unknown; value?: unknown };

/**
 * The codes in a subscription's properties, or [] when it isn't a pack. A
 * stored blend with any malformed or repeated code counts as no blend, so it
 * can't be edited: dropping the bad code would let a smaller blend through
 * the size check on a subscription still priced for the larger one.
 */
export const blendCodesOf = (properties: unknown): string[] => {
  const list = Array.isArray(properties) ? (properties as Property[]) : [];
  const value = list.find((p) => p.name === BLEND_CODES_KEY)?.value;
  if (typeof value !== "string") return [];
  const codes = value.split(",").map((code) => code.trim());
  return codes.every((code) => CODE.test(code)) && new Set(codes).size === codes.length
    ? codes
    : [];
};

/** The words in a subscription's properties, for the portal to show. */
export const blendLabelOf = (properties: unknown): string | null => {
  const list = Array.isArray(properties) ? (properties as Property[]) : [];
  const value = list.find((p) => p.name === BLEND_LABEL_KEY)?.value;
  return typeof value === "string" && value ? value : null;
};

/** A request's codes: 1–10 distinct well-formed codes, or null. */
export const parseBlendCodes = (value: unknown): string[] | null => {
  if (!Array.isArray(value) || value.length < 1 || value.length > 10) return null;
  if (!value.every((code) => typeof code === "string" && CODE.test(code))) return null;
  return new Set(value).size === value.length ? (value as string[]) : null;
};

const QUERY = `query BlendRange { metaobjects(type: "blend_ingredient", first: 50) { nodes {
  name: field(key: "name") { value } code: field(key: "code") { value } sort: field(key: "sort") { value }
} } }`;

/** The store's range, in its order; null when it can't be read. */
export const blendRange = async (env: BlendEnv): Promise<BlendOption[] | null> => {
  if (!env.SHOPIFY_STOREFRONT_TOKEN || !env.SHOPIFY_STORE_DOMAIN) return null;
  const response = await fetch(
    `https://${env.SHOPIFY_STORE_DOMAIN}/api/${env.SHOPIFY_API_VERSION}/graphql.json`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "X-Shopify-Storefront-Access-Token": env.SHOPIFY_STOREFRONT_TOKEN,
      },
      body: JSON.stringify({ query: QUERY }),
    },
  ).catch(() => null);
  if (!response?.ok) return null;
  const body = (await response.json().catch(() => null)) as {
    data?: {
      metaobjects?: {
        nodes?: {
          name?: { value?: string };
          code?: { value?: string };
          sort?: { value?: string };
        }[];
      };
    };
  } | null;
  const nodes = body?.data?.metaobjects?.nodes;
  if (!Array.isArray(nodes)) return null;
  return (
    nodes
      .flatMap((node) => {
        const code = node.code?.value ?? "";
        const name = node.name?.value?.trim() ?? "";
        return CODE.test(code) && name
          ? [
              {
                sort: Number(node.sort?.value ?? 0),
                option: { code, name, shortName: name.replace(/\s*\(.*\)\s*$/, "") },
              },
            ]
          : [];
      })
      .sort((a, b) => a.sort - b.sort)
      .map(({ option }) => option)
      // One option per code. Shopify doesn't force the code field to be unique,
      // and two entries sharing one would write two ingredients for one choice.
      .filter(
        (option, index, all) => all.findIndex((o) => o.code === option.code) === index,
      )
  );
};

/**
 * The properties to write for a new blend: every existing property kept, the
 * two blend ones replaced. Recharge's PUT replaces the whole list, so sending
 * only the blend would drop the rest (found in SHO-84). Codes in the range's
 * order; the label built here, never taken from the request.
 */
export const withBlend = (
  properties: unknown,
  codes: readonly string[],
  range: readonly BlendOption[],
): { name: string; value: string }[] => {
  const ordered = range.filter((option) => codes.includes(option.code));
  const kept = (Array.isArray(properties) ? (properties as Property[]) : [])
    .filter((p) => p.name !== BLEND_CODES_KEY && p.name !== BLEND_LABEL_KEY)
    .filter(
      (p): p is { name: string; value: string } =>
        typeof p.name === "string" && typeof p.value === "string",
    );
  return [
    ...kept,
    { name: BLEND_CODES_KEY, value: ordered.map((option) => option.code).join(",") },
    {
      name: BLEND_LABEL_KEY,
      value: ordered.map((option) => option.shortName).join(" + "),
    },
  ];
};
