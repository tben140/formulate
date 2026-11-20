#!/usr/bin/env node
/**
 * Creates the routine quiz's data in Shopify (SHO-161): the `routine_goal`
 * metaobject definition, one entry per goal, and `vegan` tags.
 *
 * ⚠️ A store change. Run it only with Ben's go-ahead, from a laptop, never in
 * CI or from web or the app. Idempotent: run again after editing
 * routine-quiz-data.json and it updates in place (upsert by handle; tags are
 * only added).
 *
 *   SHOPIFY_STORE_DOMAIN=… SHOPIFY_ADMIN_TOKEN=… node scripts/setup-routine-quiz.mjs [--dry-run]
 *
 * The Admin token needs write_metaobject_definitions, write_metaobjects and
 * write_products. It's a secret: pass it in the environment, never commit it.
 */
import { readFile } from "node:fs/promises";

const domain = process.env.SHOPIFY_STORE_DOMAIN;
const token = process.env.SHOPIFY_ADMIN_TOKEN;
const dryRun = process.argv.includes("--dry-run");
const data = JSON.parse(
  await readFile(new URL("./routine-quiz-data.json", import.meta.url), "utf8"),
);

if (!domain || (!token && !dryRun)) {
  console.error("Set SHOPIFY_STORE_DOMAIN and SHOPIFY_ADMIN_TOKEN (or pass --dry-run).");
  process.exit(1);
}

const admin = async (query, variables) => {
  if (dryRun) {
    console.log("[dry run]", query.trim().split("\n")[0], JSON.stringify(variables));
    return {};
  }
  const response = await fetch(`https://${domain}/admin/api/2026-04/graphql.json`, {
    method: "POST",
    headers: { "content-type": "application/json", "X-Shopify-Access-Token": token },
    body: JSON.stringify({ query, variables }),
  });
  const body = await response.json();
  if (body.errors) throw new Error(JSON.stringify(body.errors));
  return body.data;
};

const userErrors = (payload, what) => {
  const errors = payload?.userErrors ?? [];
  // "TAKEN" on the definition means it already exists, which is fine.
  const real = errors.filter((error) => error.code !== "TAKEN");
  if (real.length) throw new Error(`${what}: ${JSON.stringify(real)}`);
};

// 1. The definition, readable by the storefront.
const definition = await admin(
  `mutation Definition($definition: MetaobjectDefinitionCreateInput!) {
    metaobjectDefinitionCreate(definition: $definition) { userErrors { field message code } }
  }`,
  {
    definition: {
      type: "routine_goal",
      name: "Routine goal",
      displayNameKey: "label",
      access: { storefront: "PUBLIC_READ" },
      fieldDefinitions: [
        { key: "key", name: "Key", type: "single_line_text_field", required: true },
        { key: "label", name: "Label", type: "single_line_text_field", required: true },
        {
          key: "products",
          name: "Products",
          type: "list.product_reference",
          required: true,
        },
      ],
    },
  },
);
userErrors(definition.metaobjectDefinitionCreate, "definition");

// Product handles → ids.
const handles = [
  ...new Set([...data.goals.flatMap((goal) => goal.products), ...data.veganTags]),
];
const ids = new Map();
for (const handle of handles) {
  const found = await admin(
    `query Product($handle: String!) { productByHandle: productByIdentifier(identifier: { handle: $handle }) { id } }`,
    { handle },
  );
  const id = found.productByHandle?.id;
  if (!id && !dryRun) throw new Error(`No product with handle ${handle}`);
  ids.set(handle, id ?? `gid://shopify/Product/${handle}`);
}

// 2. One entry per goal, upserted by handle.
for (const goal of data.goals) {
  const result = await admin(
    `mutation Goal($handle: MetaobjectHandleInput!, $metaobject: MetaobjectUpsertInput!) {
      metaobjectUpsert(handle: $handle, metaobject: $metaobject) { userErrors { field message code } }
    }`,
    {
      handle: { type: "routine_goal", handle: goal.key },
      metaobject: {
        fields: [
          { key: "key", value: goal.key },
          { key: "label", value: goal.label },
          {
            key: "products",
            value: JSON.stringify(goal.products.map((handle) => ids.get(handle))),
          },
        ],
      },
    },
  );
  userErrors(result.metaobjectUpsert, `goal ${goal.key}`);
}

// 3. Vegan tags (added, never removed).
for (const handle of data.veganTags) {
  const result = await admin(
    `mutation Tag($id: ID!, $tags: [String!]!) { tagsAdd(id: $id, tags: $tags) { userErrors { field message } } }`,
    { id: ids.get(handle), tags: ["vegan"] },
  );
  userErrors(result.tagsAdd, `tag ${handle}`);
}

console.log(
  `${dryRun ? "[dry run] " : ""}routine_goal: ${data.goals.length} goals; vegan tags on ${data.veganTags.length} products.`,
);
