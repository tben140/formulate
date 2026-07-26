/* eslint-disable */
import * as types from './graphql';



/**
 * Map of all GraphQL operations in the project.
 *
 * This map has several performance disadvantages:
 * 1. It is not tree-shakeable, so it will include all operations in the project.
 * 2. It is not minifiable, so the string of a GraphQL query will be multiple times inside the bundle.
 * 3. It does not support dead code elimination, so it will add unused operations.
 *
 * Therefore it is highly recommended to use the babel or swc plugin for production.
 * Learn more about it here: https://the-guild.dev/graphql/codegen/plugins/presets/preset-client#reducing-bundle-size
 */
type Documents = {
    "\n  query CollectionProducts($handle: String!, $first: Int!) {\n    collection(handle: $handle) {\n      id\n      title\n      description\n      products(first: $first) {\n        nodes {\n          id\n          handle\n          title\n          featuredImage {\n            url\n            altText\n            width\n            height\n          }\n          priceRange {\n            minVariantPrice {\n              amount\n              currencyCode\n            }\n          }\n        }\n      }\n    }\n  }\n": typeof types.CollectionProductsDocument,
    "\n  query ProductByHandle($handle: String!) {\n    product(handle: $handle) {\n      id\n      handle\n      title\n      description\n      featuredImage {\n        url\n        altText\n        width\n        height\n      }\n      images(first: 6) {\n        nodes {\n          url\n          altText\n          width\n          height\n        }\n      }\n      priceRange {\n        minVariantPrice {\n          amount\n          currencyCode\n        }\n      }\n      variants(first: 20) {\n        nodes {\n          id\n          title\n          availableForSale\n          price {\n            amount\n            currencyCode\n          }\n        }\n      }\n    }\n  }\n": typeof types.ProductByHandleDocument,
    "\n  query ShopName {\n    shop {\n      name\n      primaryDomain {\n        url\n      }\n    }\n  }\n": typeof types.ShopNameDocument,
    "\n  mutation CartCreate($lines: [CartLineInput!]!) {\n    cartCreate(input: { lines: $lines }) {\n      cart {\n        id\n        checkoutUrl\n        totalQuantity\n        cost {\n          totalAmount {\n            amount\n            currencyCode\n          }\n        }\n      }\n      userErrors {\n        field\n        message\n      }\n    }\n  }\n": typeof types.CartCreateDocument,
};
const documents: Documents = {
    "\n  query CollectionProducts($handle: String!, $first: Int!) {\n    collection(handle: $handle) {\n      id\n      title\n      description\n      products(first: $first) {\n        nodes {\n          id\n          handle\n          title\n          featuredImage {\n            url\n            altText\n            width\n            height\n          }\n          priceRange {\n            minVariantPrice {\n              amount\n              currencyCode\n            }\n          }\n        }\n      }\n    }\n  }\n": types.CollectionProductsDocument,
    "\n  query ProductByHandle($handle: String!) {\n    product(handle: $handle) {\n      id\n      handle\n      title\n      description\n      featuredImage {\n        url\n        altText\n        width\n        height\n      }\n      images(first: 6) {\n        nodes {\n          url\n          altText\n          width\n          height\n        }\n      }\n      priceRange {\n        minVariantPrice {\n          amount\n          currencyCode\n        }\n      }\n      variants(first: 20) {\n        nodes {\n          id\n          title\n          availableForSale\n          price {\n            amount\n            currencyCode\n          }\n        }\n      }\n    }\n  }\n": types.ProductByHandleDocument,
    "\n  query ShopName {\n    shop {\n      name\n      primaryDomain {\n        url\n      }\n    }\n  }\n": types.ShopNameDocument,
    "\n  mutation CartCreate($lines: [CartLineInput!]!) {\n    cartCreate(input: { lines: $lines }) {\n      cart {\n        id\n        checkoutUrl\n        totalQuantity\n        cost {\n          totalAmount {\n            amount\n            currencyCode\n          }\n        }\n      }\n      userErrors {\n        field\n        message\n      }\n    }\n  }\n": types.CartCreateDocument,
};

/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query CollectionProducts($handle: String!, $first: Int!) {\n    collection(handle: $handle) {\n      id\n      title\n      description\n      products(first: $first) {\n        nodes {\n          id\n          handle\n          title\n          featuredImage {\n            url\n            altText\n            width\n            height\n          }\n          priceRange {\n            minVariantPrice {\n              amount\n              currencyCode\n            }\n          }\n        }\n      }\n    }\n  }\n"): typeof import('./graphql').CollectionProductsDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query ProductByHandle($handle: String!) {\n    product(handle: $handle) {\n      id\n      handle\n      title\n      description\n      featuredImage {\n        url\n        altText\n        width\n        height\n      }\n      images(first: 6) {\n        nodes {\n          url\n          altText\n          width\n          height\n        }\n      }\n      priceRange {\n        minVariantPrice {\n          amount\n          currencyCode\n        }\n      }\n      variants(first: 20) {\n        nodes {\n          id\n          title\n          availableForSale\n          price {\n            amount\n            currencyCode\n          }\n        }\n      }\n    }\n  }\n"): typeof import('./graphql').ProductByHandleDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query ShopName {\n    shop {\n      name\n      primaryDomain {\n        url\n      }\n    }\n  }\n"): typeof import('./graphql').ShopNameDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation CartCreate($lines: [CartLineInput!]!) {\n    cartCreate(input: { lines: $lines }) {\n      cart {\n        id\n        checkoutUrl\n        totalQuantity\n        cost {\n          totalAmount {\n            amount\n            currencyCode\n          }\n        }\n      }\n      userErrors {\n        field\n        message\n      }\n    }\n  }\n"): typeof import('./graphql').CartCreateDocument;


export function graphql(source: string) {
  return (documents as any)[source] ?? {};
}
