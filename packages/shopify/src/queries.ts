import { graphql } from "./generated";

/**
 * Every Storefront query the apps use, in one place.
 *
 * These are written with the generated `graphql()` helper so codegen can infer
 * exact result and variable types per operation. Codegen runs with
 * `documentMode: "string"`, so what ships at runtime is a plain string with
 * phantom types attached — no `graphql` package in either app's bundle.
 */

export const CollectionProductsQuery = graphql(`
  query CollectionProducts($handle: String!, $first: Int!, $filters: [ProductFilter!]) {
    collection(handle: $handle) {
      id
      title
      description
      seo {
        title
        description
      }
      # COLLECTION_DEFAULT is the merchant's configured sort for this
      # collection, the same order Liquid's collection.products uses, so the
      # three surfaces agree. It is also the API default: stated here so it is a
      # decision rather than an inheritance (SHO-111).
      products(first: $first, sortKey: COLLECTION_DEFAULT, filters: $filters) {
        # The filters Search & Discovery offers for this collection, with counts
        # for the current selection. See src/filters.ts.
        filters {
          ...FilterFields
        }
        nodes {
          id
          handle
          title
          featuredImage {
            url
            altText
            width
            height
          }
          priceRange {
            minVariantPrice {
              amount
              currencyCode
            }
          }
        }
      }
    }
  }
`);

export const ProductByHandleQuery = graphql(`
  query ProductByHandle($handle: String!) {
    product(handle: $handle) {
      id
      handle
      title
      description
      # The merchant's search-engine overrides from the admin. Either can be
      # null, in which case apps/web falls back to the title and description.
      seo {
        title
        description
      }
      # Aliased so it can't collide with other fields reading collections: the
      # breadcrumb picks the first of these that's in the navigation menu.
      breadcrumbCollections: collections(first: 20) {
        nodes {
          handle
          title
        }
      }
      # Both exist for the Klaviyo payload, which must match what the theme's
      # app embed already emits — see packages/analytics/src/events.ts.
      vendor
      # Klaviyo Categories. Sorted by title in events.ts, because this comes
      # back in creation order and the theme's list is alphabetical. SHO-126.
      collections(first: 50) {
        nodes {
          title
        }
      }
      compareAtPriceRange {
        minVariantPrice {
          amount
          currencyCode
        }
      }
      featuredImage {
        url
        altText
        width
        height
      }
      # GALLERY_LIMIT in gallery.ts: the product page shows up to ten.
      images(first: 10) {
        nodes {
          url
          altText
          width
          height
        }
      }
      priceRange {
        minVariantPrice {
          amount
          currencyCode
        }
      }
      # The option axes, in the merchant's order. Drives which pickers render
      # and in what sequence — do not derive this from the variants, which have
      # no defined ordering.
      options {
        name
        optionValues {
          name
        }
      }
      # Selling plans as declared on the PRODUCT. Read this only to know which
      # groups exist and who owns them; what a given variant can actually be
      # bought on is sellingPlanAllocations below, which is a smaller set.
      sellingPlanGroups(first: 10) {
        nodes {
          name
          appName
          options {
            name
            values
          }
          # Needed to map an allocation back to its group. An allocation names
          # only its plan, so without these ids there is no way to tell which
          # of a variant's plans belong to an app-managed group — and the
          # appName filter becomes unusable.
          #
          # NB: no backticks anywhere in this document. These queries live in
          # JS template literals, so a backtick silently ends the string and
          # the file stops parsing.
          sellingPlans(first: 20) {
            nodes {
              id
            }
          }
        }
      }
      variants(first: 100) {
        nodes {
          id
          title
          availableForSale
          # For the Product structured data on apps/web. Can be null.
          sku
          selectedOptions {
            name
            value
          }
          price {
            amount
            currencyCode
          }
          compareAtPrice {
            amount
            currencyCode
          }
          image {
            url
            altText
            width
            height
          }
          # The authoritative list of plans purchasable for THIS variant, with
          # the price each one charges. Never compute a subscription price by
          # discounting price yourself — the adjustment is Shopify's to apply.
          sellingPlanAllocations(first: 10) {
            nodes {
              sellingPlan {
                id
                name
              }
              priceAdjustments {
                price {
                  amount
                  currencyCode
                }
              }
            }
          }
        }
      }
    }
  }
`);

/* -------------------------------------------------------------------------- */
/*  Search & Discovery                                                         */
/* -------------------------------------------------------------------------- */

/**
 * A filter as Shopify's Search & Discovery app configures it. Which filters
 * exist (availability, price, options, metafields...) is set in that app, not
 * here; `src/filters.ts` turns them into URL state and back.
 */
export const FilterFields = graphql(`
  fragment FilterFields on Filter {
    id
    label
    type
    values {
      id
      label
      count
      input
    }
  }
`);

/** The fields a product card needs, shared by search and recommendations. */
export const ProductCardFields = graphql(`
  fragment ProductCardFields on Product {
    id
    handle
    title
    featuredImage {
      url
      altText
      width
      height
    }
    priceRange {
      minVariantPrice {
        amount
        currencyCode
      }
    }
  }
`);

/**
 * Full search, as Search & Discovery tunes it (synonyms, boosts). Products
 * only for now; `productFilters` are the filters for these results.
 */
export const SearchProductsQuery = graphql(`
  query SearchProducts($query: String!, $first: Int!, $filters: [ProductFilter!]) {
    search(query: $query, first: $first, types: [PRODUCT], productFilters: $filters) {
      totalCount
      productFilters {
        ...FilterFields
      }
      nodes {
        # Search results are a union; the type name lets callers keep products.
        __typename
        ... on Product {
          ...ProductCardFields
        }
      }
    }
  }
`);

/**
 * Type-ahead. Products, collections and suggested queries for a partial term.
 */
export const PredictiveSearchQuery = graphql(`
  query PredictiveSearch($query: String!, $limit: Int!) {
    predictiveSearch(query: $query, limit: $limit, types: [PRODUCT, COLLECTION, QUERY]) {
      queries {
        text
        styledText
      }
      products {
        ...ProductCardFields
      }
      collections {
        id
        handle
        title
      }
    }
  }
`);

/**
 * "Pairs well with": the complementary products set per product in Search &
 * Discovery (Product recommendations → Complementary). Empty until a merchant
 * sets them; Shopify does not infer these the way it does RELATED.
 */
export const ComplementaryProductsQuery = graphql(`
  query ComplementaryProducts($productId: ID!) {
    productRecommendations(productId: $productId, intent: COMPLEMENTARY) {
      ...ProductCardFields
    }
  }
`);

/**
 * The storefront navigation menu (SHO-60). Only the top level is used: nested
 * items would need a disclosure menu, and the store's menu is flat.
 * `toNavLinks` turns the result into routes every surface can use.
 */
export const NavMenuQuery = graphql(`
  query NavMenu($handle: String!) {
    menu(handle: $handle) {
      items {
        id
        title
        type
        url
      }
    }
  }
`);

/**
 * Collections as cards for the home page's "Shop by category" (SHO-61). There's
 * no image on the collections themselves, so each card shows its first
 * product's. Callers keep the ones in the navigation menu, in menu order.
 */
export const CollectionCardsQuery = graphql(`
  query CollectionCards {
    collections(first: 50) {
      nodes {
        id
        handle
        title
        description
        image {
          url
          altText
          width
          height
        }
        products(first: 1) {
          nodes {
            featuredImage {
              url
              altText
              width
              height
            }
          }
        }
      }
    }
  }
`);

/**
 * Every store policy at once: there are five, the Storefront API has no
 * by-handle lookup, and a missing one is simply null.
 */
export const ShopPoliciesQuery = graphql(`
  query ShopPolicies {
    shop {
      privacyPolicy {
        title
        handle
        body
      }
      refundPolicy {
        title
        handle
        body
      }
      termsOfService {
        title
        handle
        body
      }
      shippingPolicy {
        title
        handle
        body
      }
      subscriptionPolicy {
        title
        handle
        body
      }
    }
  }
`);

/**
 * Used by the smoke-test script to prove a token works before any UI exists.
 */
export const ShopNameQuery = graphql(`
  query ShopName {
    shop {
      name
      primaryDomain {
        url
      }
    }
  }
`);

/* -------------------------------------------------------------------------- */
/*  Cart                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Everything the surfaces need from a cart, in one fragment.
 *
 * Every cart operation returns this, so a mutation response is directly usable
 * as the new state — no refetch, and no chance of the mutation and the query
 * disagreeing about what a cart looks like.
 *
 * Codegen runs with `fragmentMasking: false`, so consumers get the fields
 * inline rather than an opaque masked type.
 */
export const CartFields = graphql(`
  fragment CartFields on Cart {
    id
    checkoutUrl
    totalQuantity
    buyerIdentity {
      countryCode
    }
    cost {
      subtotalAmount {
        amount
        currencyCode
      }
      totalAmount {
        amount
        currencyCode
      }
      totalTaxAmount {
        amount
        currencyCode
      }
    }
    lines(first: 100) {
      nodes {
        id
        quantity
        cost {
          totalAmount {
            amount
            currencyCode
          }
        }
        merchandise {
          ... on ProductVariant {
            id
            title
            availableForSale
            image {
              url
              altText
              width
              height
            }
            price {
              amount
              currencyCode
            }
            selectedOptions {
              name
              value
            }
            product {
              # For excluding what is already in the cart from
              # recommendations, and as the source product for them.
              id
              handle
              title
            }
          }
        }
        sellingPlanAllocation {
          sellingPlan {
            id
            name
          }
        }
      }
    }
  }
`);

/**
 * Fetches an existing cart.
 *
 * ⚠️ `id` must be the COMPLETE identifier, including the `?key=` suffix:
 * `gid://shopify/Cart/{token}?key={secret}`. See `isCartId` in ./cart for what
 * actually breaks when it is missing — it is narrower, and quieter, than it
 * first appears.
 *
 * Returns null for a cart that has been completed at checkout, so a null here
 * is normal rather than exceptional.
 */
export const CartQuery = graphql(`
  query Cart($id: ID!) {
    cart(id: $id) {
      ...CartFields
    }
  }
`);

/**
 * `buyerIdentity` is not optional in practice — see DEFAULT_COUNTRY_CODE.
 */
export const CartCreateMutation = graphql(`
  mutation CartCreate($input: CartInput!) {
    cartCreate(input: $input) {
      cart {
        ...CartFields
      }
      userErrors {
        field
        message
        code
      }
      # Stock problems arrive here, not in userErrors: a sold-out or short add
      # "succeeds" with a warning naming the cart line. See addLinesOrCreate.
      warnings {
        code
        message
        target
      }
    }
  }
`);

export const CartLinesAddMutation = graphql(`
  mutation CartLinesAdd($cartId: ID!, $lines: [CartLineInput!]!) {
    cartLinesAdd(cartId: $cartId, lines: $lines) {
      cart {
        ...CartFields
      }
      userErrors {
        field
        message
        code
      }
      # Stock problems arrive here, not in userErrors: a sold-out or short add
      # "succeeds" with a warning naming the cart line. See addLinesOrCreate.
      warnings {
        code
        message
        target
      }
    }
  }
`);

export const CartLinesUpdateMutation = graphql(`
  mutation CartLinesUpdate($cartId: ID!, $lines: [CartLineUpdateInput!]!) {
    cartLinesUpdate(cartId: $cartId, lines: $lines) {
      cart {
        ...CartFields
      }
      userErrors {
        field
        message
        code
      }
    }
  }
`);

export const CartLinesRemoveMutation = graphql(`
  mutation CartLinesRemove($cartId: ID!, $lineIds: [ID!]!) {
    cartLinesRemove(cartId: $cartId, lineIds: $lineIds) {
      cart {
        ...CartFields
      }
      userErrors {
        field
        message
        code
      }
    }
  }
`);

/**
 * Used to correct the country on a cart that was created without one — and to
 * attach a customer once accounts exist.
 */
export const CartBuyerIdentityUpdateMutation = graphql(`
  mutation CartBuyerIdentityUpdate(
    $cartId: ID!
    $buyerIdentity: CartBuyerIdentityInput!
  ) {
    cartBuyerIdentityUpdate(cartId: $cartId, buyerIdentity: $buyerIdentity) {
      cart {
        ...CartFields
      }
      userErrors {
        field
        message
        code
      }
    }
  }
`);

/**
 * Everything apps/web's sitemap lists, one page at a time.
 *
 * Only what the Headless channel can see, which is exactly what the web app
 * can render. `products(first: 1)` on each collection is there to leave empty
 * collections out: a sitemap entry for a page with nothing on it is worse than
 * none.
 */
export const SitemapProductsQuery = graphql(`
  query SitemapProducts($after: String) {
    products(first: 250, after: $after) {
      nodes {
        handle
        updatedAt
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`);

export const SitemapCollectionsQuery = graphql(`
  query SitemapCollections($after: String) {
    collections(first: 250, after: $after) {
      nodes {
        handle
        updatedAt
        products(first: 1) {
          nodes {
            id
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`);

/**
 * Products to suggest in the cart drawer (SHO-116).
 *
 * RELATED, not COMPLEMENTARY, measured on this store on 2026-09-27:
 * COMPLEMENTARY returned nothing for every product tried (it needs the Search
 * & Discovery app and hand-configured pairings), while RELATED returned five
 * sensible products each time. The documented behaviour is a silent fallback
 * to RELATED; here it was an empty list instead, so the intent is stated.
 *
 * `variants(first: 2)` is only there to tell single-variant products, which
 * can be added in one tap, from ones that need a choice made on their page.
 */
export const ProductRecommendationsQuery = graphql(`
  query ProductRecommendations($productId: ID!) {
    productRecommendations(productId: $productId, intent: RELATED) {
      id
      handle
      title
      availableForSale
      featuredImage {
        url
        altText
        width
        height
      }
      priceRange {
        minVariantPrice {
          amount
          currencyCode
        }
      }
      variants(first: 2) {
        nodes {
          id
          availableForSale
        }
      }
    }
  }
`);
