/**
 * Who is writing this review, and did they buy the product?
 *
 * `POST /reviews/new` takes the shopper's Shopify Customer Account access
 * token in `Authorization`, and asks Shopify, with that token, for the
 * customer's id, email and orders. Shopify's answer is the only source of the
 * reviewer's identity: no email or customer id is taken from the request
 * (AGENTS.md, apps/api). Judge.me then marks the review "Verified buyer" from
 * that email, and we only send it when the product is in the customer's
 * orders, so every review written here is from someone who bought it.
 */

export interface ReviewerEnv {
  /** Plain vars: they name the store and API version, they grant nothing. */
  readonly SHOPIFY_SHOP_ID?: string;
  readonly SHOPIFY_API_VERSION?: string;
}

export type ReviewerCheck =
  | { readonly kind: "ok"; readonly customerId: string; readonly email: string }
  /** No token, or Shopify refused it: sign in (again). */
  | { readonly kind: "signed-out" }
  /** Signed in, but the product isn't in their recent orders. */
  | { readonly kind: "not-purchased" }
  /** A phone-only account: Judge.me needs an email to verify the review. */
  | { readonly kind: "no-email" }
  /** Shopify couldn't be reached or failed: says nothing about the token. */
  | { readonly kind: "unavailable" };

/** The last 50 orders, 50 lines each: far more than a shopper here has. */
const REVIEWER_QUERY = `{
  customer {
    id
    emailAddress { emailAddress }
    orders(first: 50, reverse: true) {
      nodes { lineItems(first: 50) { nodes { productId } } }
    }
  }
}`;

interface ReviewerResponse {
  readonly data?: {
    readonly customer?: {
      readonly id?: string;
      readonly emailAddress?: { readonly emailAddress?: string | null } | null;
      readonly orders?: {
        readonly nodes?: readonly {
          readonly lineItems?: {
            readonly nodes?: readonly { readonly productId?: string | null }[];
          };
        }[];
      };
    } | null;
  };
}

/** The bare token: the Customer Account API takes it without "Bearer". */
export const customerToken = (request: Request): string | null =>
  request.headers
    .get("Authorization")
    ?.replace(/^Bearer\s+/i, "")
    .trim() || null;

export const checkReviewer = async (
  env: ReviewerEnv,
  accessToken: string,
  productId: string,
): Promise<ReviewerCheck> => {
  let response: Response;
  try {
    response = await fetch(
      `https://shopify.com/${env.SHOPIFY_SHOP_ID}/account/customer/api/${env.SHOPIFY_API_VERSION}/graphql`,
      {
        method: "POST",
        headers: { Authorization: accessToken, "content-type": "application/json" },
        body: JSON.stringify({ query: REVIEWER_QUERY }),
      },
    );
  } catch {
    return { kind: "unavailable" };
  }
  if (response.status >= 500) return { kind: "unavailable" };
  if (!response.ok) return { kind: "signed-out" };

  const body = (await response.json().catch(() => null)) as ReviewerResponse | null;
  const customer = body?.data?.customer;
  const customerId = customer?.id?.match(/^gid:\/\/shopify\/Customer\/(\d+)$/)?.[1];
  if (!customer || !customerId) return { kind: "signed-out" };

  const bought = (customer.orders?.nodes ?? []).some((order) =>
    (order.lineItems?.nodes ?? []).some(
      (line) => line.productId === `gid://shopify/Product/${productId}`,
    ),
  );
  if (!bought) return { kind: "not-purchased" };

  const email = customer.emailAddress?.emailAddress?.trim();
  return email ? { kind: "ok", customerId, email } : { kind: "no-email" };
};
