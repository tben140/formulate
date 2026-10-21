#!/usr/bin/env node
/**
 * Every subscription ships free (SHO-99), but only if its selling plan group
 * is attached to the "Subscriptions: free standard delivery" delivery
 * profile. Recharge creates three groups for every product it sells on
 * subscription, so a new product's groups start outside the profile, and its
 * renewals quietly charge delivery again.
 *
 * This lists the groups that are missing, and with --fix attaches them. Only
 * groups owned by the same app as the profile's existing groups count (or
 * --app-id, for an empty profile), so Shopify's seed plans never join it.
 *
 *   SHOPIFY_STORE_DOMAIN=… SHOPIFY_ADMIN_TOKEN=… node scripts/check-subscription-delivery.mjs [--fix] [--app-id=…]
 *
 * The Admin token needs read_products and read_shipping (write_shipping for
 * --fix). It's a secret: pass it in the environment, never commit it. Exits
 * 1 when groups are missing and --fix wasn't given, so it can run in CI.
 */

const PROFILE_NAME = "Subscriptions: free standard delivery";
const API_VERSION = "2026-04";

const domain = process.env.SHOPIFY_STORE_DOMAIN;
const token = process.env.SHOPIFY_ADMIN_TOKEN;
const fix = process.argv.includes("--fix");

if (!domain || !token) {
  console.error("Set SHOPIFY_STORE_DOMAIN and SHOPIFY_ADMIN_TOKEN.");
  process.exit(2);
}

const admin = async (query, variables = {}) => {
  const response = await fetch(
    `https://${domain}/admin/api/${API_VERSION}/graphql.json`,
    {
      method: "POST",
      headers: { "content-type": "application/json", "X-Shopify-Access-Token": token },
      body: JSON.stringify({ query, variables }),
    },
  );
  const body = await response.json().catch(() => null);
  if (!response.ok || !body || body.errors) {
    throw new Error(
      `Admin API ${response.status}: ${JSON.stringify(body?.errors ?? body)}`,
    );
  }
  return body.data;
};

/** Every page of a connection, as a flat list of nodes. */
const all = async (query, path) => {
  const nodes = [];
  let after = null;
  for (;;) {
    const data = await admin(query, { after });
    const connection = path(data);
    nodes.push(...connection.nodes);
    if (!connection.pageInfo.hasNextPage) return nodes;
    after = connection.pageInfo.endCursor;
  }
};

const profiles = await all(
  `query ($after: String) { deliveryProfiles(first: 50, after: $after) {
     nodes { id name } pageInfo { hasNextPage endCursor } } }`,
  (data) => data.deliveryProfiles,
);
const profile = profiles.find((p) => p.name === PROFILE_NAME);
if (!profile) {
  console.error(`No delivery profile named "${PROFILE_NAME}". See SHO-99.`);
  process.exit(1);
}

const attachedGroups = await all(
  `query ($after: String) { deliveryProfile(id: "${profile.id}") {
     sellingPlanGroups(first: 100, after: $after) { nodes { id appId } pageInfo { hasNextPage endCursor } } } }`,
  (data) => data.deliveryProfile.sellingPlanGroups,
);
const attached = new Set(attachedGroups.map((group) => group.id));

/*
 * Which app's plans this profile is for: the app that owns the groups already
 * in it (Recharge, here). Read from the store rather than hard-coded, and
 * passed explicitly with --app-id when the profile is still empty. Groups from
 * any other app, or from none (Shopify's seed plans), are never attached.
 */
const appIdArg = process.argv.find((arg) => arg.startsWith("--app-id="))?.split("=")[1];
const appIds = new Set(
  appIdArg ? [appIdArg] : attachedGroups.map((g) => g.appId).filter(Boolean),
);
if (appIds.size === 0) {
  console.error(
    "The profile has no plan groups yet: pass --app-id=<the subscription app's id>.",
  );
  process.exit(2);
}

// Groups reached through products: the app-owned groups aren't listed by the
// shop-level sellingPlanGroups query, but they are on each product.
// 25 products × 30 groups keeps each page under Shopify's 1,000-point query
// cost limit; a product with more groups than that is paged on its own.
const products = await all(
  `query ($after: String) { products(first: 25, after: $after) {
     nodes { id title sellingPlanGroups(first: 30) {
       nodes { id name appId } pageInfo { hasNextPage endCursor } } }
     pageInfo { hasNextPage endCursor } } }`,
  (data) => data.products,
);
for (const product of products) {
  if (!product.sellingPlanGroups.pageInfo.hasNextPage) continue;
  const rest = await all(
    `query ($after: String) { product(id: "${product.id}") {
       sellingPlanGroups(first: 100, after: $after) {
         nodes { id name appId } pageInfo { hasNextPage endCursor } } } }`,
    (data) => data.product.sellingPlanGroups,
  );
  product.sellingPlanGroups.nodes = rest;
}

const missing = products.flatMap((product) =>
  product.sellingPlanGroups.nodes
    .filter((group) => appIds.has(group.appId) && !attached.has(group.id))
    .map((group) => ({ ...group, product: product.title })),
);

if (missing.length === 0) {
  console.log(`All ${attached.size} subscription plan groups ship free.`);
  process.exit(0);
}

console.log(`${missing.length} plan group(s) not in "${PROFILE_NAME}":`);
for (const group of missing)
  console.log(`  ${group.product}: ${group.name} (${group.id})`);

if (!fix) {
  console.log("Run again with --fix to attach them.");
  process.exit(1);
}

const result = await admin(
  `mutation ($id: ID!, $groups: [ID!]!) {
     deliveryProfileUpdate(id: $id, profile: { sellingPlanGroupsToAssociate: $groups }) {
       userErrors { field message } } }`,
  { id: profile.id, groups: [...new Set(missing.map((group) => group.id))] },
);
const errors = result.deliveryProfileUpdate.userErrors;
if (errors.length) {
  console.error("Shopify refused:", errors);
  process.exit(1);
}
console.log(`Attached ${missing.length}. New products' subscriptions now ship free.`);
