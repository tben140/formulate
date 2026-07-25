export { createStorefrontClient } from "./client";
export type { StorefrontClient, StorefrontClientConfig } from "./client";

export { describeError } from "./errors";
export type {
  GraphQLErrorShape,
  StorefrontError,
  StorefrontResult,
} from "./errors";

export { formatMoney } from "./format-money";
export type { MoneyLike } from "./format-money";

export {
  CollectionProductsQuery,
  ProductByHandleQuery,
  ShopNameQuery,
} from "./queries";

export { DEFAULT_API_VERSION, DEFAULT_COLLECTION_HANDLE } from "./config";

export type {
  CollectionProductsQuery as CollectionProductsResult,
  ProductByHandleQuery as ProductByHandleResult,
} from "./generated/graphql";
