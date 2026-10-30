export { createStorefrontClient } from "./client";
export type { StorefrontClient, StorefrontClientConfig } from "./client";

export { createCartClient, isCartId } from "./cart";
export type { Cart, CartClient } from "./cart";

export { describeError } from "./errors";
export type {
  GraphQLErrorShape,
  StorefrontError,
  StorefrontResult,
  UserErrorShape,
} from "./errors";

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
  CollectionProductsQuery,
  ProductByHandleQuery,
  ProductRecommendationsQuery,
  ShopNameQuery,
} from "./queries";

export {
  DEFAULT_API_VERSION,
  DEFAULT_COLLECTION_HANDLE,
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
