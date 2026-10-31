import type { Admin } from "./admin";
import { parseHistory, type PriceChange } from "./price-history";
import type { ReportOrder } from "./report";
import type { CampaignEntry, CollectionInfo, DiscountInfo, ProductInfo } from "./types";

/**
 * The Admin API reads and writes behind the commands, kept apart from their
 * logic so that's tested without a store. API version: see admin.ts.
 */

/** Where `campaigns prices record` keeps each variant's price history: owned by the app. */
export const PRICE_NAMESPACE = "$app:campaigns";
export const PRICE_KEY = "price_history";

const ENTRY_FIELDS = `
  id
  handle
  updatedAt
  capabilities { publishable { status } }
  fields { key value }
  image: field(key: "image") {
    reference { ... on MediaImage { image { altText } } }
  }
`;

interface EntryNode {
  id: string;
  handle: string;
  updatedAt?: string;
  capabilities: { publishable: { status: string } | null };
  fields: { key: string; value: string | null }[];
  image: { reference: { image?: { altText: string | null } | null } | null } | null;
}

const toEntry = (node: EntryNode): CampaignEntry => ({
  id: node.id,
  handle: node.handle,
  updatedAt: node.updatedAt ?? null,
  published: node.capabilities.publishable?.status === "ACTIVE",
  fields: Object.fromEntries(node.fields.map((field) => [field.key, field.value])),
  imageAlt: node.image?.reference?.image?.altText ?? null,
});

export const getEntry = async (
  admin: Admin,
  handle: string,
): Promise<CampaignEntry | null> => {
  const data = await admin.request<{ metaobjectByHandle: EntryNode | null }>(
    `query Entry($handle: String!) {
      metaobjectByHandle(handle: { type: "campaign", handle: $handle }) { ${ENTRY_FIELDS} }
    }`,
    { handle },
  );
  return data.metaobjectByHandle ? toEntry(data.metaobjectByHandle) : null;
};

export const getEntries = async (admin: Admin): Promise<CampaignEntry[]> => {
  const data = await admin.request<{ metaobjects: { nodes: EntryNode[] } }>(
    `query Entries { metaobjects(type: "campaign", first: 250) { nodes { ${ENTRY_FIELDS} } } }`,
  );
  return data.metaobjects.nodes.map(toEntry);
};

/**
 * The Online Store's publication. Found by its channel's handle, which is
 * fixed, rather than by a title or an id that differs per store.
 */
const onlineStorePublication = async (admin: Admin): Promise<string | null> => {
  const data = await admin.request<{
    publications: {
      nodes: { id: string; channels: { nodes: { handle: string }[] } }[];
    };
  }>(
    `query Publications {
      publications(first: 50) { nodes { id channels(first: 5) { nodes { handle } } } }
    }`,
    {},
  );
  return (
    data.publications.nodes.find((p) =>
      p.channels.nodes.some((c) => c.handle === "online_store"),
    )?.id ?? null
  );
};

export const getCollection = async (
  admin: Admin,
  id: string,
  entryId: string,
): Promise<{ collection: CollectionInfo; products: ProductInfo[] } | null> => {
  const onlineStore = await onlineStorePublication(admin);
  const data = await admin.request<{
    collection: {
      id: string;
      handle: string;
      title: string;
      productsCount: { count: number } | null;
      ruleSet: {
        rules: { column: string; relation: string; condition: string }[];
      } | null;
      products: {
        nodes: {
          id: string;
          title: string;
          status: string;
          onOnlineStore?: boolean;
          campaign: { value: string } | null;
          variants: {
            nodes: {
              id: string;
              title: string;
              price: string;
              campaign: { value: string } | null;
              inventoryQuantity: number | null;
              inventoryItem: {
                tracked: boolean;
                unitCost: { amount: string } | null;
              } | null;
              priceHistory: { value: string } | null;
            }[];
          };
        }[];
      };
    } | null;
  }>(
    `query Collection($id: ID!, $onlineStore: ID!, $hasOnlineStore: Boolean!) {
      collection(id: $id) {
        id
        handle
        title
        productsCount { count }
        ruleSet { rules { column relation condition } }
        products(first: 250) {
          nodes {
            id
            title
            status
            # Not onlineStoreUrl: that's null for every product while the
            # store is password-protected, published or not.
            onOnlineStore: publishedOnPublication(publicationId: $onlineStore)
              @include(if: $hasOnlineStore)
            campaign: metafield(namespace: "double_helix", key: "campaign") { value }
            variants(first: 50) {
              nodes {
                id
                title
                price
                campaign: metafield(namespace: "double_helix", key: "campaign") { value }
                inventoryQuantity
                inventoryItem { tracked unitCost { amount } }
                priceHistory: metafield(namespace: "${PRICE_NAMESPACE}", key: "${PRICE_KEY}") { value }
              }
            }
          }
        }
      }
    }`,
    // Without an Online Store channel (removed from a headless-only store)
    // the field is skipped, and every product counts as off it.
    {
      id,
      onlineStore: onlineStore ?? id,
      hasOnlineStore: onlineStore !== null,
    },
  );
  const collection = data.collection;
  if (!collection) return null;
  const rules = collection.ruleSet?.rules ?? [];
  return {
    collection: {
      id: collection.id,
      handle: collection.handle,
      title: collection.title,
      productsCount: collection.productsCount?.count ?? 0,
      ruleMatchesCampaign:
        rules.length === 1 &&
        rules[0]!.column === "PRODUCT_METAFIELD_DEFINITION" &&
        rules[0]!.relation === "EQUALS" &&
        rules[0]!.condition === entryId,
    },
    products: collection.products.nodes.map((product) => ({
      id: product.id,
      title: product.title,
      status: product.status,
      onOnlineStore: product.onOnlineStore ?? false,
      campaignId: product.campaign?.value ?? null,
      variants: product.variants.nodes.map((variant) => ({
        id: variant.id,
        title: variant.title,
        price: variant.price,
        campaignId: variant.campaign?.value ?? null,
        cost: variant.inventoryItem?.unitCost?.amount ?? null,
        stock: variant.inventoryItem?.tracked ? (variant.inventoryQuantity ?? 0) : null,
        priceHistory: parseHistory(variant.priceHistory?.value),
      })),
    })),
  };
};

interface DiscountNode {
  id: string;
  config: { jsonValue: unknown } | null;
  discount: {
    __typename: string;
    title: string;
    status: string;
    startsAt: string;
    endsAt: string | null;
    customerGets?: {
      appliesOnOneTimePurchase: boolean;
      appliesOnSubscription: boolean;
      value: { percentage?: number };
      items: { collections?: { nodes: { id: string }[] } };
    };
    codes?: { nodes: { code: string }[] };
  };
}

/**
 * Discounts, with what the checks compare: those running or scheduled, or
 * every one with `includeExpired` (the report, after the campaign).
 */
export const getDiscounts = async (
  admin: Admin,
  { includeExpired = false }: { includeExpired?: boolean } = {},
): Promise<DiscountInfo[]> => {
  const basic = `
    title status startsAt endsAt
    customerGets {
      appliesOnOneTimePurchase appliesOnSubscription
      value { ... on DiscountPercentage { percentage } }
      items { ... on DiscountCollections { collections(first: 10) { nodes { id } } } }
    }`;
  const nodes: DiscountNode[] = [];
  let after: string | null = null;
  do {
    const data: {
      discountNodes: {
        nodes: DiscountNode[];
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
      };
    } = await admin.request(
      `query Discounts($query: String, $after: String) {
      discountNodes(first: 100, after: $after, query: $query) {
        nodes {
          id
          config: metafield(namespace: "$app:campaign-discount", key: "config") { jsonValue }
          discount {
            __typename
            ... on DiscountAutomaticBasic { ${basic} }
            ... on DiscountCodeBasic { ${basic} codes(first: 10) { nodes { code } } }
            ... on DiscountAutomaticApp { title status startsAt endsAt }
            ... on DiscountCodeApp { title status startsAt endsAt codes(first: 10) { nodes { code } } }
          }
        }
        pageInfo { hasNextPage endCursor }
      }
    }`,
      { query: includeExpired ? null : "status:active OR status:scheduled", after },
    );
    nodes.push(...data.discountNodes.nodes);
    after = data.discountNodes.pageInfo.hasNextPage
      ? data.discountNodes.pageInfo.endCursor
      : null;
  } while (after);
  return nodes
    .filter((node) => node.discount.title !== undefined)
    .map((node) => {
      const type = node.discount.__typename;
      const gets = node.discount.customerGets;
      return {
        id: node.id,
        title: node.discount.title,
        kind: type.endsWith("Basic") ? "basic" : type.endsWith("App") ? "app" : "other",
        method: type.startsWith("DiscountCode") ? "code" : "automatic",
        status: node.discount.status,
        startsAt: node.discount.startsAt,
        endsAt: node.discount.endsAt,
        percent:
          gets?.value.percentage !== undefined
            ? Math.round(gets.value.percentage * 100)
            : null,
        appliesOnOneTimePurchase: gets?.appliesOnOneTimePurchase ?? null,
        appliesOnSubscription: gets?.appliesOnSubscription ?? null,
        collectionIds: gets?.items.collections?.nodes.map((c) => c.id) ?? [],
        config: node.config?.jsonValue ?? null,
        codes: node.discount.codes?.nodes.map((c) => c.code) ?? [],
      } satisfies DiscountInfo;
    });
};

/** The Function's handle (apps/shopify-app/extensions/campaign-discount). */
export const FUNCTION_HANDLE = "campaign-discount";

const userErrors = (result: { userErrors?: { message: string }[] } | undefined) => {
  const errors = result?.userErrors ?? [];
  if (errors.length > 0) throw new Error(errors.map((e) => e.message).join("; "));
};

/**
 * Creates or updates the campaign's Function discount: its title, dates,
 * config. A new one is deactivated straight away unless `activate`, so
 * nothing changes at checkout until Ben switches it on.
 */
export const upsertFunctionDiscount = async (
  admin: Admin,
  input: {
    existingId: string | null;
    title: string;
    code: string | null;
    startsAt: string;
    endsAt: string;
    config: unknown;
    activate: boolean;
    /** Personal codes: uses per code, and once per customer. */
    usageLimit?: number;
    appliesOncePerCustomer?: boolean;
  },
): Promise<string> => {
  const metafields = [
    {
      namespace: "$app:campaign-discount",
      key: "config",
      type: "json",
      value: JSON.stringify(input.config),
    },
  ];
  const common = {
    title: input.title,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    combinesWith: {
      orderDiscounts: false,
      productDiscounts: false,
      shippingDiscounts: true,
    },
    metafields,
    ...(input.code && input.usageLimit !== undefined
      ? { usageLimit: input.usageLimit }
      : {}),
    ...(input.code && input.appliesOncePerCustomer !== undefined
      ? { appliesOncePerCustomer: input.appliesOncePerCustomer }
      : {}),
  };
  const kind = input.code ? "Code" : "Automatic";
  const field = input.code ? "codeAppDiscount" : "automaticAppDiscount";
  const nodeField = input.code ? "codeDiscountNode" : "automaticDiscountNode";

  if (input.existingId) {
    const data = await admin.request<
      Record<string, { userErrors: { message: string }[] }>
    >(
      `mutation Update($id: ID!, $discount: Discount${kind}AppInput!) {
        result: discount${kind}AppUpdate(id: $id, ${input.code ? "codeAppDiscount" : "automaticAppDiscount"}: $discount) {
          userErrors { message }
        }
      }`,
      {
        id: input.existingId,
        discount: { ...common, ...(input.code ? { code: input.code } : {}) },
      },
    );
    userErrors(data.result);
    return input.existingId;
  }

  const data = await admin.request<
    Record<
      string,
      { userErrors: { message: string }[] } & Record<string, { id: string } | null>
    >
  >(
    `mutation Create($discount: Discount${kind}AppInput!) {
      result: discount${kind}AppCreate(${field}: $discount) {
        ${nodeField}: ${input.code ? "codeAppDiscount" : "automaticAppDiscount"} { discountId }
        userErrors { message }
      }
    }`,
    {
      discount: {
        ...common,
        functionHandle: FUNCTION_HANDLE,
        discountClasses: ["PRODUCT"],
        ...(input.code ? { code: input.code } : {}),
      },
    },
  );
  userErrors(data.result);
  const id = (data.result?.[nodeField] as { discountId?: string } | null)?.discountId;
  if (!id) throw new Error("Shopify didn't return the new discount");
  if (!input.activate) {
    const off = await admin.request<
      Record<string, { userErrors: { message: string }[] }>
    >(
      `mutation Off($id: ID!) { result: discount${kind}Deactivate(id: $id) { userErrors { message } } }`,
      { id },
    );
    userErrors(off.result);
  }
  return id;
};

/** The product field definition smart collections test ("Campaign equals …"). */
export const getCampaignDefinitionIds = async (
  admin: Admin,
): Promise<{ productField: string; metaobjectDefinition: string }> => {
  const data = await admin.request<{
    metafieldDefinitions: { nodes: { id: string }[] };
    metaobjectDefinitionByType: { id: string } | null;
  }>(
    `query Definitions {
      metafieldDefinitions(first: 1, ownerType: PRODUCT, namespace: "double_helix", key: "campaign") { nodes { id } }
      metaobjectDefinitionByType(type: "campaign") { id }
    }`,
  );
  const productField = data.metafieldDefinitions.nodes[0]?.id;
  const metaobjectDefinition = data.metaobjectDefinitionByType?.id;
  if (!productField || !metaobjectDefinition)
    throw new Error(
      "The campaign definitions are missing: see docs/campaigns.md, The model",
    );
  return { productField, metaobjectDefinition };
};

/**
 * A new campaign from a template: the entry as a draft, its smart collection
 * ("Campaign equals this campaign", unpublished), and the entry pointing to
 * it. Nothing shows anywhere until the entry is published.
 */
export const createCampaign = async (
  admin: Admin,
  input: { handle: string; fields: { key: string; value: string }[] },
): Promise<{ entryId: string; collectionId: string }> => {
  const { productField } = await getCampaignDefinitionIds(admin);
  const created = await admin.request<{
    metaobjectCreate: {
      metaobject: { id: string } | null;
      userErrors: { message: string }[];
    };
  }>(
    `mutation Create($metaobject: MetaobjectCreateInput!) {
      metaobjectCreate(metaobject: $metaobject) { metaobject { id } userErrors { message } }
    }`,
    {
      metaobject: {
        type: "campaign",
        handle: input.handle,
        capabilities: { publishable: { status: "DRAFT" } },
        fields: input.fields,
      },
    },
  );
  userErrors(created.metaobjectCreate);
  const entryId = created.metaobjectCreate.metaobject!.id;
  // A failure after this leaves no half-made campaign: the draft entry and
  // any collection are deleted before the error is rethrown.
  let collectionId: string | null = null;
  try {
    const title =
      input.fields.find((field) => field.key === "title")?.value ?? input.handle;

    const collection = await admin.request<{
      collectionCreate: {
        collection: { id: string } | null;
        userErrors: { message: string }[];
      };
    }>(
      `mutation Collection($input: CollectionInput!) {
        collectionCreate(input: $input) { collection { id } userErrors { message } }
      }`,
      {
        input: {
          title,
          handle: input.handle,
          ruleSet: {
            appliedDisjunctively: false,
            rules: [
              {
                column: "PRODUCT_METAFIELD_DEFINITION",
                relation: "EQUALS",
                condition: entryId,
                conditionObjectId: productField,
              },
            ],
          },
        },
      },
    );
    userErrors(collection.collectionCreate);
    collectionId = collection.collectionCreate.collection!.id;

    const linked = await admin.request<{
      metaobjectUpdate: { userErrors: { message: string }[] };
    }>(
      `mutation Link($id: ID!, $metaobject: MetaobjectUpdateInput!) {
        metaobjectUpdate(id: $id, metaobject: $metaobject) { userErrors { message } }
      }`,
      {
        id: entryId,
        metaobject: { fields: [{ key: "collection", value: collectionId }] },
      },
    );
    userErrors(linked.metaobjectUpdate);
  } catch (error) {
    if (collectionId)
      await admin
        .request(
          `mutation DeleteCollection($id: ID!) { collectionDelete(input: { id: $id }) { userErrors { message } } }`,
          { id: collectionId },
        )
        .catch(() => undefined);
    await admin
      .request(
        `mutation DeleteEntry($id: ID!) { metaobjectDelete(id: $id) { userErrors { message } } }`,
        { id: entryId },
      )
      .catch(() => undefined);
    throw error;
  }
  return { entryId, collectionId };
};

interface OrderNode {
  name: string;
  createdAt: string;
  sourceName: string | null;
  currentSubtotalPriceSet: { shopMoney: { amount: string; currencyCode: string } };
  customAttributes: { key: string; value: string | null }[];
  customer: { id: string; orders: { nodes: { name: string }[] } } | null;
  customerJourneySummary: {
    lastVisit: {
      utmParameters: { source: string | null; campaign: string | null } | null;
    } | null;
  } | null;
  discountApplications: {
    nodes: { title?: string; code?: string }[];
  };
  lineItems: {
    nodes: {
      title: string;
      quantity: number;
      sellingPlan: { name: string } | null;
      discountAllocations: {
        allocatedAmountSet: { shopMoney: { amount: string } };
        discountApplication: { title?: string; code?: string };
      }[];
    }[];
  };
}

/**
 * Orders from the campaign's start to a week after its end (late orders
 * from the last email), as the report reads them. `campaignDiscounts`:
 * titles or codes of the campaign's discounts, to cost them.
 */
export const getOrders = async (
  admin: Admin,
  startsAt: string,
  endsAt: string,
  campaignDiscounts: readonly string[],
): Promise<ReportOrder[]> => {
  const until = new Date(
    new Date(endsAt).getTime() + 7 * 24 * 60 * 60 * 1000,
  ).toISOString();
  const orders: ReportOrder[] = [];
  let after: string | null = null;
  do {
    const data: {
      orders: {
        nodes: OrderNode[];
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
      };
    } = await admin.request(
      `query Orders($query: String!, $after: String) {
        orders(first: 100, after: $after, query: $query) {
          nodes {
            name createdAt sourceName
            currentSubtotalPriceSet { shopMoney { amount currencyCode } }
            customAttributes { key value }
            customer { id orders(first: 1, sortKey: CREATED_AT) { nodes { name } } }
            customerJourneySummary { lastVisit { utmParameters { source campaign } } }
            discountApplications(first: 10) {
              nodes {
                ... on AutomaticDiscountApplication { title }
                ... on DiscountCodeApplication { code }
              }
            }
            lineItems(first: 50) {
              nodes {
                title quantity
                sellingPlan { name }
                discountAllocations {
                  allocatedAmountSet { shopMoney { amount } }
                  discountApplication {
                    ... on AutomaticDiscountApplication { title }
                    ... on DiscountCodeApplication { code }
                  }
                }
              }
            }
          }
          pageInfo { hasNextPage endCursor }
        }
      }`,
      { query: `created_at:>='${startsAt}' AND created_at:<'${until}'`, after },
    );
    for (const node of data.orders.nodes) {
      const label = (application: { title?: string; code?: string }) =>
        application.title ?? application.code ?? "";
      orders.push({
        name: node.name,
        createdAt: node.createdAt,
        subtotal: Number(node.currentSubtotalPriceSet.shopMoney.amount),
        currencyCode: node.currentSubtotalPriceSet.shopMoney.currencyCode,
        discounts: node.discountApplications.nodes.map(label).filter(Boolean),
        campaignDiscount: node.lineItems.nodes
          .flatMap((line) => line.discountAllocations)
          .filter((allocation) =>
            campaignDiscounts.includes(label(allocation.discountApplication)),
          )
          .reduce(
            (sum, allocation) =>
              sum + Number(allocation.allocatedAmountSet.shopMoney.amount),
            0,
          ),
        attributes: Object.fromEntries(
          node.customAttributes.map((attribute) => [
            attribute.key,
            attribute.value ?? "",
          ]),
        ),
        sourceName: node.sourceName,
        utmSource: node.customerJourneySummary?.lastVisit?.utmParameters?.source ?? null,
        utmCampaign:
          node.customerJourneySummary?.lastVisit?.utmParameters?.campaign ?? null,
        firstOrder: node.customer
          ? node.customer.orders.nodes[0]?.name === node.name
          : null,
        customerId: node.customer?.id ?? null,
        lines: node.lineItems.nodes.map((line) => ({
          title: line.title,
          quantity: line.quantity,
          subscription: line.sellingPlan !== null,
        })),
      });
    }
    after = data.orders.pageInfo.hasNextPage ? data.orders.pageInfo.endCursor : null;
  } while (after);
  return orders;
};

/** The perk's variant: its product, for Recharge, and a title for the box. */
export const getPerkVariant = async (
  admin: Admin,
  id: string,
): Promise<{ variantId: string; productId: string; title: string } | null> => {
  const data = await admin.request<{
    productVariant: {
      id: string;
      title: string;
      product: { id: string; title: string };
    } | null;
  }>(
    `query PerkVariant($id: ID!) {
      productVariant(id: $id) { id title product { id title } }
    }`,
    { id },
  );
  const variant = data.productVariant;
  if (!variant) return null;
  return {
    variantId: variant.id,
    productId: variant.product.id,
    title:
      variant.title === "Default Title"
        ? variant.product.title
        : `${variant.product.title} (${variant.title})`,
  };
};

/** Every variant's price and recorded history, for `campaigns prices record`. */
export const getVariantPrices = async (
  admin: Admin,
): Promise<{ id: string; label: string; price: string; history: PriceChange[] }[]> => {
  const variants: { id: string; label: string; price: string; history: PriceChange[] }[] =
    [];
  let after: string | null = null;
  do {
    const data: {
      productVariants: {
        nodes: {
          id: string;
          title: string;
          price: string;
          product: { title: string };
          history: { value: string } | null;
        }[];
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
      };
    } = await admin.request(
      `query VariantPrices($after: String) {
        productVariants(first: 250, after: $after) {
          nodes {
            id
            title
            price
            product { title }
            history: metafield(namespace: "${PRICE_NAMESPACE}", key: "${PRICE_KEY}") { value }
          }
          pageInfo { hasNextPage endCursor }
        }
      }`,
      { after },
    );
    for (const node of data.productVariants.nodes)
      variants.push({
        id: node.id,
        label:
          node.title === "Default Title"
            ? node.product.title
            : `${node.product.title}, ${node.title}`,
        price: node.price,
        history: parseHistory(node.history?.value),
      });
    after = data.productVariants.pageInfo.hasNextPage
      ? data.productVariants.pageInfo.endCursor
      : null;
  } while (after);
  return variants;
};

/** Writes price histories, 25 at a time (metafieldsSet's limit). */
export const writePriceHistories = async (
  admin: Admin,
  updates: readonly { id: string; history: readonly PriceChange[] }[],
): Promise<void> => {
  for (let i = 0; i < updates.length; i += 25) {
    const batch = updates.slice(i, i + 25);
    const data = await admin.request<{
      metafieldsSet: { userErrors: { field: string[] | null; message: string }[] };
    }>(
      `mutation PriceHistory($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) { userErrors { field message } }
      }`,
      {
        metafields: batch.map((update) => ({
          ownerId: update.id,
          namespace: PRICE_NAMESPACE,
          key: PRICE_KEY,
          type: "json",
          value: JSON.stringify(update.history),
        })),
      },
    );
    const errors = data.metafieldsSet.userErrors;
    if (errors.length > 0)
      throw new Error(
        `Price history not saved: ${errors.map((e) => e.message).join("; ")}`,
      );
  }
};

/** Adds a tag to customers, one call each (tagsAdd is idempotent). Needs write_customers. */
export const tagCustomers = async (
  admin: Admin,
  customerIds: readonly string[],
  tag: string,
): Promise<void> => {
  for (const id of customerIds) {
    const data = await admin.request<{
      tagsAdd: { userErrors: { message: string }[] };
    }>(
      `mutation Tag($id: ID!, $tags: [String!]!) {
        tagsAdd(id: $id, tags: $tags) { userErrors { message } }
      }`,
      { id, tags: [tag] },
    );
    const errors = data.tagsAdd.userErrors;
    if (errors.length > 0)
      throw new Error(`Tagging ${id} failed: ${errors.map((e) => e.message).join("; ")}`);
  }
};

/**
 * Adds codes to a code discount, 250 at a time (the mutation's limit). Shopify
 * imports them in the background; the result is how many it accepted.
 */
export const addRedeemCodes = async (
  admin: Admin,
  discountId: string,
  codes: readonly string[],
): Promise<number> => {
  let accepted = 0;
  for (let i = 0; i < codes.length; i += 250) {
    const batch = codes.slice(i, i + 250);
    const data = await admin.request<{
      discountRedeemCodeBulkAdd: {
        bulkCreation: { codesCount: number } | null;
        userErrors: { message: string }[];
      };
    }>(
      `mutation Codes($discountId: ID!, $codes: [DiscountRedeemCodeInput!]!) {
        discountRedeemCodeBulkAdd(discountId: $discountId, codes: $codes) {
          bulkCreation { codesCount }
          userErrors { message }
        }
      }`,
      { discountId, codes: batch.map((code) => ({ code })) },
    );
    const errors = data.discountRedeemCodeBulkAdd.userErrors;
    if (errors.length > 0)
      throw new Error(`Codes not added: ${errors.map((e) => e.message).join("; ")}`);
    accepted += data.discountRedeemCodeBulkAdd.bulkCreation?.codesCount ?? 0;
  }
  return accepted;
};

/** Signs a campaign off: approved_by and approved_at on the record. */
export const approveCampaign = async (
  admin: Admin,
  id: string,
  by: string,
  at: Date,
): Promise<void> => {
  const data = await admin.request<{
    metaobjectUpdate: { userErrors: { message: string }[] };
  }>(
    `mutation Approve($id: ID!, $fields: [MetaobjectFieldInput!]!) {
      metaobjectUpdate(id: $id, metaobject: { fields: $fields }) { userErrors { message } }
    }`,
    {
      id,
      fields: [
        { key: "approved_by", value: by },
        { key: "approved_at", value: at.toISOString() },
      ],
    },
  );
  const errors = data.metaobjectUpdate.userErrors;
  if (errors.length > 0)
    throw new Error(`Not approved: ${errors.map((e) => e.message).join("; ")}`);
};

/**
 * After a campaign (docs/campaigns.md, Housekeeping): takes the campaign off
 * its products and variants, deletes its smart collection, and sets the
 * record back to draft, kept for the report but shown nowhere. Expired
 * discounts are left: they do nothing, and the report reads them.
 */
export const tidyCampaign = async (
  admin: Admin,
  input: { entryId: string; collectionId: string | null; owners: readonly string[] },
): Promise<void> => {
  for (let i = 0; i < input.owners.length; i += 25) {
    const data = await admin.request<{
      metafieldsDelete: { userErrors: { message: string }[] };
    }>(
      `mutation Untag($metafields: [MetafieldIdentifierInput!]!) {
        metafieldsDelete(metafields: $metafields) { userErrors { message } }
      }`,
      {
        metafields: input.owners
          .slice(i, i + 25)
          .map((ownerId) => ({ ownerId, namespace: "double_helix", key: "campaign" })),
      },
    );
    const errors = data.metafieldsDelete.userErrors;
    if (errors.length > 0) throw new Error(errors.map((e) => e.message).join("; "));
  }
  if (input.collectionId) {
    const data = await admin.request<{
      collectionDelete: { userErrors: { message: string }[] };
    }>(
      `mutation Drop($input: CollectionDeleteInput!) {
        collectionDelete(input: $input) { userErrors { message } }
      }`,
      { input: { id: input.collectionId } },
    );
    const errors = data.collectionDelete.userErrors;
    if (errors.length > 0) throw new Error(errors.map((e) => e.message).join("; "));
  }
  const data = await admin.request<{
    metaobjectUpdate: { userErrors: { message: string }[] };
  }>(
    `mutation Draft($id: ID!) {
      metaobjectUpdate(id: $id, metaobject: { capabilities: { publishable: { status: DRAFT } } }) {
        userErrors { message }
      }
    }`,
    { id: input.entryId },
  );
  const errors = data.metaobjectUpdate.userErrors;
  if (errors.length > 0) throw new Error(errors.map((e) => e.message).join("; "));
};

/** Writes one field of a campaign record. */
export const setCampaignField = async (
  admin: Admin,
  id: string,
  key: string,
  value: string,
): Promise<void> => {
  const data = await admin.request<{
    metaobjectUpdate: { userErrors: { message: string }[] };
  }>(
    `mutation Field($id: ID!, $fields: [MetaobjectFieldInput!]!) {
      metaobjectUpdate(id: $id, metaobject: { fields: $fields }) { userErrors { message } }
    }`,
    { id, fields: [{ key, value }] },
  );
  const errors = data.metaobjectUpdate.userErrors;
  if (errors.length > 0) throw new Error(errors.map((e) => e.message).join("; "));
};
