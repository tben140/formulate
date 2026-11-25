import { describe, expect, it } from "vitest";

import {
  nextCursor,
  nextPageParams,
  pageVariables,
  previousPageParams,
} from "./pagination";

const q = (query: string) => new URLSearchParams(query);

/** A middle page, as the API returns it. */
const middle = {
  hasNextPage: true,
  hasPreviousPage: true,
  startCursor: "eyJsYXN0X2lkIjo0fQ==",
  endCursor: "eyJsYXN0X2lkIjo4fQ==",
};

/** A collection with no products: no pages either side, no cursors. */
const empty = {
  hasNextPage: false,
  hasPreviousPage: false,
  startCursor: null,
  endCursor: null,
};

describe("pageVariables", () => {
  it("starts at the beginning with no cursor", () => {
    expect(pageVariables(q(""), 24)).toEqual({ first: 24 });
  });

  it("pages forward from after and backward from before", () => {
    expect(pageVariables(q("after=abc"), 24)).toEqual({ first: 24, after: "abc" });
    expect(pageVariables(q("before=abc"), 24)).toEqual({ last: 24, before: "abc" });
    // Both is a hand-edited URL; before wins, so the result is one page.
    expect(pageVariables(q("after=x&before=y"), 24)).toEqual({ last: 24, before: "y" });
  });

  it("ignores anything that isn't a cursor rather than sending it", () => {
    expect(pageVariables(q("after="), 24)).toEqual({ first: 24 });
    expect(pageVariables(q("after=not a cursor!"), 24)).toEqual({ first: 24 });
    expect(pageVariables(q(`after=${"a".repeat(600)}`), 24)).toEqual({ first: 24 });
    // The theme's numbered pages mean nothing to the API.
    expect(pageVariables(q("page=2"), 24)).toEqual({ first: 24 });
  });
});

describe("next and previous", () => {
  it("builds both links from a middle page, keeping filters and dropping old cursors", () => {
    const params = q("filter.v.option.flavour=Vanilla&after=old&page=3");
    expect(nextPageParams(params, middle)?.toString()).toBe(
      `filter.v.option.flavour=Vanilla&after=${encodeURIComponent(middle.endCursor)}`,
    );
    expect(previousPageParams(params, middle)?.toString()).toBe(
      `filter.v.option.flavour=Vanilla&before=${encodeURIComponent(middle.startCursor)}`,
    );
  });

  it("has no next on the last page and no previous on the first", () => {
    expect(nextPageParams(q(""), { ...middle, hasNextPage: false })).toBeNull();
    expect(previousPageParams(q(""), { ...middle, hasPreviousPage: false })).toBeNull();
  });

  it("has neither for an empty collection", () => {
    expect(nextPageParams(q(""), empty)).toBeNull();
    expect(previousPageParams(q(""), empty)).toBeNull();
    expect(nextCursor(empty)).toBeUndefined();
  });

  it("gives infinite scroll the end cursor until the last page", () => {
    expect(nextCursor(middle)).toBe(middle.endCursor);
    expect(nextCursor({ ...middle, hasNextPage: false })).toBeUndefined();
  });
});
