import { describe, expect, it } from "vitest";

import {
  initialOptimisticCart,
  optimisticCart,
  optimisticCartReducer as reduce,
  pendingAddQuantity,
  pendingLineIds,
  type OptimisticCartLike,
} from "./cart-optimistic";

const gbp = (amount: string) => ({ amount, currencyCode: "GBP" });
const line = (id: string, quantity: number, each: number) => ({
  id,
  quantity,
  cost: { totalAmount: gbp((each * quantity).toFixed(2)) },
});
const cart = (...lines: ReturnType<typeof line>[]): OptimisticCartLike => ({
  totalQuantity: lines.reduce((sum, l) => sum + l.quantity, 0),
  cost: {
    subtotalAmount: gbp(
      lines.reduce((sum, l) => sum + Number(l.cost.totalAmount.amount), 0).toFixed(2),
    ),
  },
  lines: { nodes: lines },
});

const confirmed = cart(line("a", 2, 10), line("b", 1, 5.5));

describe("optimistic cart", () => {
  it("shows an update at once, with estimated totals", () => {
    const state = reduce(initialOptimisticCart(confirmed), {
      type: "start",
      change: { id: "1", kind: "update", lineId: "a", quantity: 3 },
    });
    const view = optimisticCart(state);
    expect(
      view?.lines.nodes.map((l) => [l.id, l.quantity, l.cost.totalAmount.amount]),
    ).toEqual([
      ["a", 3, "30.00"],
      ["b", 1, "5.50"],
    ]);
    expect(view?.totalQuantity).toBe(4);
    expect(view?.cost.subtotalAmount.amount).toBe("35.50");
    expect(pendingLineIds(state)).toEqual(new Set(["a"]));
  });

  it("hides a removed line, and treats quantity 0 as removal", () => {
    let state = reduce(initialOptimisticCart(confirmed), {
      type: "start",
      change: { id: "1", kind: "remove", lineId: "b" },
    });
    expect(optimisticCart(state)?.lines.nodes.map((l) => l.id)).toEqual(["a"]);
    state = reduce(state, {
      type: "start",
      change: { id: "2", kind: "update", lineId: "a", quantity: 0 },
    });
    expect(optimisticCart(state)?.lines.nodes).toEqual([]);
    expect(optimisticCart(state)?.cost.subtotalAmount.amount).toBe("0.00");
  });

  it("replaces the guess with Shopify's cart on success", () => {
    const server = cart(line("a", 3, 9));
    let state = reduce(initialOptimisticCart(confirmed), {
      type: "start",
      change: { id: "1", kind: "update", lineId: "a", quantity: 3 },
    });
    state = reduce(state, { type: "succeed", changeId: "1", cart: server });
    expect(optimisticCart(state)).toBe(server);
    expect(state.pending).toEqual([]);
  });

  it("rolls back to exactly the prior cart on failure, and reports it", () => {
    let state = reduce(initialOptimisticCart(confirmed), {
      type: "start",
      change: { id: "1", kind: "remove", lineId: "a" },
    });
    state = reduce(state, {
      type: "fail",
      changeId: "1",
      message: "Couldn't update your cart.",
    });
    expect(optimisticCart(state)).toBe(confirmed);
    expect(state.error).toBe("Couldn't update your cart.");
    expect(pendingLineIds(state).size).toBe(0);
  });

  it("keeps a second change in flight when the first succeeds", () => {
    let state = initialOptimisticCart(confirmed);
    state = reduce(state, {
      type: "start",
      change: { id: "1", kind: "update", lineId: "a", quantity: 5 },
    });
    state = reduce(state, {
      type: "start",
      change: { id: "2", kind: "remove", lineId: "b" },
    });
    // Shopify answers the first: a changed, b still there.
    state = reduce(state, {
      type: "succeed",
      changeId: "1",
      cart: cart(line("a", 5, 10), line("b", 1, 5.5)),
    });
    expect(optimisticCart(state)?.lines.nodes.map((l) => [l.id, l.quantity])).toEqual([
      ["a", 5],
    ]);
    // Then the second.
    state = reduce(state, {
      type: "succeed",
      changeId: "2",
      cart: cart(line("a", 5, 10)),
    });
    expect(optimisticCart(state)?.lines.nodes.map((l) => [l.id, l.quantity])).toEqual([
      ["a", 5],
    ]);
    expect(state.pending).toEqual([]);
  });

  it("keeps the other change when one of two fails", () => {
    let state = initialOptimisticCart(confirmed);
    state = reduce(state, {
      type: "start",
      change: { id: "1", kind: "update", lineId: "a", quantity: 5 },
    });
    state = reduce(state, {
      type: "start",
      change: { id: "2", kind: "remove", lineId: "b" },
    });
    state = reduce(state, { type: "fail", changeId: "1", message: "No" });
    expect(optimisticCart(state)?.lines.nodes.map((l) => [l.id, l.quantity])).toEqual([
      ["a", 2],
    ]);
  });

  it("re-applies a pending change over a cart that already has it, without doubling", () => {
    let state = reduce(initialOptimisticCart(confirmed), {
      type: "start",
      change: { id: "1", kind: "update", lineId: "a", quantity: 4 },
    });
    state = reduce(state, {
      type: "sync",
      cart: cart(line("a", 4, 10), line("b", 1, 5.5)),
    });
    expect(optimisticCart(state)?.lines.nodes[0]?.quantity).toBe(4);
  });

  it("counts adds for the badge without inventing lines", () => {
    const state = reduce(initialOptimisticCart(confirmed), {
      type: "start",
      change: { id: "1", kind: "add", quantity: 2 },
    });
    expect(pendingAddQuantity(state)).toBe(2);
    expect(optimisticCart(state)).toBe(confirmed);
  });

  it("has nothing to show before there is a cart", () => {
    expect(optimisticCart(initialOptimisticCart(null))).toBeNull();
  });
});
