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

export { formatMoney } from "./format-money";
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
  ShopNameQuery,
} from "./queries";

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
