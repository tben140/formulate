export { createStorefrontClient } from "./client";
export type { StorefrontClient, StorefrontClientConfig } from "./client";

export { createCartClient, isCartGone, isCartId } from "./cart";
export type { AddLinesOutcome, Cart, CartClient } from "./cart";

export { describeError, describeForShopper } from "./errors";
export type {
  GraphQLErrorShape,
  StorefrontError,
  StorefrontResult,
  UserErrorShape,
} from "./errors";

export {
  CUSTOMER_ACCOUNT_SCOPE,
  base64Url,
  codeChallengeFor,
  createAuthorizationRequest,
  customerAccountEndpoints,
  customerAccountRequest,
  decodeIdTokenClaims,
  describeCustomerAccountError,
  exchangeCode,
  isTokenExpiring,
  logoutUrl,
  refreshTokens,
  validateIdToken,
} from "./customer-account";
export type {
  AuthCrypto,
  AuthorizationRequest,
  CustomerAccountConfig,
  CustomerAccountError,
  CustomerAccountResult,
  CustomerTokens,
} from "./customer-account";

export {
  CUSTOMER_ORDERS_QUERY,
  CUSTOMER_ORDER_QUERY,
  orderGid,
  orderPathId,
  orderStatusLabel,
} from "./customer-orders";
export type {
  CustomerOrderDetail,
  CustomerOrderLine,
  CustomerOrderResult,
  CustomerOrderSummary,
  CustomerOrdersResult,
} from "./customer-orders";

export { formatMoney } from "./format-money";

export {
  FREE_SHIPPING_THRESHOLD,
  freeShippingMessage,
  freeShippingProgress,
} from "./free-shipping";
export type { FreeShippingProgress } from "./free-shipping";
export { RECOMMENDATION_LIMIT, selectCartSuggestions } from "./recommendations";
export type { CartSuggestion } from "./recommendations";
export type { MoneyLike } from "./format-money";

export {
  defaultSelectedOptions,
  findVariantByOptions,
  hasOwningApp,
  purchasableAllocations,
  purchasableSellingPlanGroups,
  withOption,
} from "./product-selection";
export type { SelectedOption } from "./product-selection";

export {
  CartBuyerIdentityUpdateMutation,
  CartCreateMutation,
  CartLinesAddMutation,
  CartLinesRemoveMutation,
  CartLinesUpdateMutation,
  CartQuery,
  CollectionCardsQuery,
  CollectionProductsQuery,
  ComplementaryProductsQuery,
  PredictiveSearchQuery,
  SearchProductsQuery,
  NavMenuQuery,
  ProductByHandleQuery,
  ProductRecommendationsQuery,
  ShopNameQuery,
  SitemapCollectionsQuery,
  SitemapProductsQuery,
  ShopPoliciesQuery,
} from "./queries";

export {
  LEGAL_MENU_HANDLE,
  NAV_MENU_HANDLE,
  POLICY_HANDLES,
  breadcrumbCollection,
  isPolicyHandle,
  toNavLinks,
} from "./nav";
export type { NavLink, PolicyHandle } from "./nav";

export {
  DEFAULT_API_VERSION,
  DEFAULT_COLLECTION_HANDLE,
  DEMO_STORE_NOTICE,
  DEFAULT_COUNTRY_CODE,
} from "./config";

export type {
  CartBuyerIdentityInput,
  CartLineInput,
  CartLineUpdateInput,
  CountryCode,
  CollectionProductsQuery as CollectionProductsResult,
  ProductByHandleQuery as ProductByHandleResult,
} from "./generated/graphql";

export {
  activeFilterCount,
  isSelected,
  paramValue,
  productFiltersFromParams,
  withoutEmptyFilters,
  withoutFilters,
  withPriceRange,
  withValueToggled,
} from "./filters";
export type { FilterLike, FilterValueLike } from "./filters";
export type { ProductFilter } from "./generated/graphql";
