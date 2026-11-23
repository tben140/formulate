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

/**
 * The customer and a page of their orders, newest first, each with a page of
 * its lines. Pages are followed (orders, then any order's further lines) until
 * the product turns up or there are no more, so an older purchase still
 * counts.
 */
const REVIEWER_QUERY = `query Reviewer($after: String) {
  customer {
    id
    emailAddress { emailAddress }
    orders(first: 50, reverse: true, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        lineItems(first: 50) {
          pageInfo { hasNextPage endCursor }
          nodes { productId }
        }
      }
    }
  }
}`;

const ORDER_LINES_QUERY = `query OrderLines($id: ID!, $after: String) {
  order(id: $id) {
    lineItems(first: 50, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes { productId }
    }
  }
}`;

/**
 * Shopify calls per check, at most. A Worker has 50 subrequests per request;
 * 20 pages of orders is about 1,000, far beyond any shopper here. Past that
 * it's "not purchased" rather than an open-ended crawl.
 */
const MAX_REQUESTS = 20;

interface Page<T> {
  readonly pageInfo?: {
    readonly hasNextPage?: boolean;
    readonly endCursor?: string | null;
  };
  readonly nodes?: readonly T[];
}

type Lines = Page<{ readonly productId?: string | null }>;

interface ReviewerData {
  readonly customer?: {
    readonly id?: string;
    readonly emailAddress?: { readonly emailAddress?: string | null } | null;
    readonly orders?: Page<{ readonly id?: string; readonly lineItems?: Lines }>;
  } | null;
}

interface OrderLinesData {
  readonly order?: { readonly lineItems?: Lines } | null;
}

type Answer<T> =
  | { readonly kind: "data"; readonly data: T | undefined }
  | { readonly kind: "signed-out" }
  | { readonly kind: "unavailable" };

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
  let requests = 0;
  const ask = async <T>(query: string, variables: object): Promise<Answer<T>> => {
    requests += 1;
    let response: Response;
    try {
      response = await fetch(
        `https://shopify.com/${env.SHOPIFY_SHOP_ID}/account/customer/api/${env.SHOPIFY_API_VERSION}/graphql`,
        {
          method: "POST",
          headers: { Authorization: accessToken, "content-type": "application/json" },
          body: JSON.stringify({ query, variables }),
        },
      );
    } catch {
      return { kind: "unavailable" };
    }
    if (response.status >= 500) return { kind: "unavailable" };
    if (!response.ok) return { kind: "signed-out" };
    const body = (await response.json().catch(() => null)) as {
      data?: T | null;
      errors?: readonly unknown[];
    } | null;
    // Shopify answers 200 with `errors` when it's throttled or failing
    // (THROTTLED, INTERNAL_SERVER_ERROR): that says nothing about the token.
    // A refused token is a 401, above.
    if (!body || body.errors?.length) return { kind: "unavailable" };
    return { kind: "data", data: body.data ?? undefined };
  };

  const wanted = `gid://shopify/Product/${productId}`;
  const has = (lines: Lines | undefined) =>
    (lines?.nodes ?? []).some((line) => line.productId === wanted);
  const more = (page: Page<unknown> | undefined) =>
    page?.pageInfo?.hasNextPage && page.pageInfo.endCursor
      ? page.pageInfo.endCursor
      : undefined;

  let customerId: string | undefined;
  let email: string | undefined;
  let bought = false;
  /** Orders with more lines than the first page, and where to carry on. */
  const longOrders: { id: string; after: string }[] = [];
  let ordersAfter: string | undefined;

  do {
    const answer = await ask<ReviewerData>(REVIEWER_QUERY, {
      after: ordersAfter ?? null,
    });
    if (answer.kind !== "data") return answer;
    const customer = answer.data?.customer;
    customerId ??= customer?.id?.match(/^gid:\/\/shopify\/Customer\/(\d+)$/)?.[1];
    if (!customer || !customerId) return { kind: "signed-out" };
    email ??= customer.emailAddress?.emailAddress?.trim() || undefined;

    for (const order of customer.orders?.nodes ?? []) {
      if (has(order.lineItems)) bought = true;
      const after = more(order.lineItems);
      if (order.id && after) longOrders.push({ id: order.id, after });
    }
    ordersAfter = more(customer.orders);
  } while (!bought && ordersAfter && requests < MAX_REQUESTS);

  for (const order of longOrders) {
    let after: string | undefined = order.after;
    while (!bought && after && requests < MAX_REQUESTS) {
      const answer = await ask<OrderLinesData>(ORDER_LINES_QUERY, {
        id: order.id,
        after,
      });
      if (answer.kind !== "data") return answer;
      const lines = answer.data?.order?.lineItems;
      bought = has(lines);
      after = more(lines);
    }
  }

  if (!bought || !customerId) return { kind: "not-purchased" };
  return email ? { kind: "ok", customerId, email } : { kind: "no-email" };
};
