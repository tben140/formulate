import { describe, expect, it } from "vitest";

import type { Admin } from "./admin";
import { getTaggedCustomers } from "./shopify-data";

/** An Admin client that answers each request with the next page given. */
const pages = (
  ...replies: { ids: number[]; hasNextPage: boolean; endCursor: string | null }[]
): Admin => {
  let call = 0;
  return {
    request: async <T>() => {
      const reply = replies[call++];
      if (!reply) throw new Error("asked for more pages than there are");
      return {
        customers: {
          nodes: reply.ids.map((n) => ({ id: `gid://shopify/Customer/${n}` })),
          pageInfo: { hasNextPage: reply.hasNextPage, endCursor: reply.endCursor },
        },
      } as T;
    },
  };
};

describe("getTaggedCustomers", () => {
  it("follows the cursor to the last page", async () => {
    const admin = pages(
      { ids: [1, 2], hasNextPage: true, endCursor: "a" },
      { ids: [3], hasNextPage: false, endCursor: "b" },
    );
    expect(await getTaggedCustomers(admin, "segment:lapsed")).toEqual([
      "gid://shopify/Customer/1",
      "gid://shopify/Customer/2",
      "gid://shopify/Customer/3",
    ]);
  });

  it("fails rather than looping when the cursor doesn't move", async () => {
    const admin = pages(
      { ids: [1], hasNextPage: true, endCursor: "a" },
      { ids: [1], hasNextPage: true, endCursor: "a" },
    );
    await expect(getTaggedCustomers(admin, "segment:lapsed")).rejects.toThrow(
      /didn't advance/,
    );
  });

  it("fails rather than truncating when another page has no cursor", async () => {
    const admin = pages({ ids: [1], hasNextPage: true, endCursor: null });
    await expect(getTaggedCustomers(admin, "segment:lapsed")).rejects.toThrow(
      /didn't advance/,
    );
  });
});
