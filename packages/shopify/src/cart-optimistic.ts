/**
 * Optimistic cart state, shared by web and the app (SHO-52).
 *
 * A cart change is a round trip to Shopify, and a shopper pressing "remove"
 * shouldn't wait for it. So the change shows at once, and the cart Shopify
 * sends back replaces the guess when it arrives.
 *
 * The state is the last cart Shopify confirmed plus the changes still in
 * flight. What the shopper sees is always derived: the confirmed cart with the
 * pending changes applied on top. That makes the three hard cases simple:
 *
 * - **Success:** the server's cart becomes the confirmed one, and the other
 *   changes still in flight are re-applied over it. Server truth always wins
 *   for anything it has answered.
 * - **Failure:** the change is dropped. Nothing has to be undone by hand: the
 *   view goes back to exactly what it was without that change, and the error
 *   is kept for the UI to report.
 * - **Two changes at once:** each is applied in order; one finishing doesn't
 *   lose the other.
 *
 * Only quantity changes and removals are optimistic. An add needs the new
 * line's price and selling plan from Shopify, so it shows as pending (a count
 * on the cart badge) until the cart comes back.
 */

interface Money {
  readonly amount: string;
  readonly currencyCode: string;
}

/** The parts of a cart this works on; `Cart` (cart.ts) is one. */
export interface OptimisticCartLike {
  readonly totalQuantity: number;
  readonly cost: { readonly subtotalAmount: Money };
  readonly lines: {
    readonly nodes: readonly {
      readonly id: string;
      readonly quantity: number;
      readonly cost: { readonly totalAmount: Money };
    }[];
  };
}

export type CartChange =
  | {
      readonly id: string;
      readonly kind: "update";
      readonly lineId: string;
      readonly quantity: number;
    }
  | { readonly id: string; readonly kind: "remove"; readonly lineId: string }
  | { readonly id: string; readonly kind: "add"; readonly quantity: number };

export interface OptimisticCartState<C extends OptimisticCartLike> {
  /** The last cart Shopify returned; null before there is one. */
  readonly confirmed: C | null;
  /** Changes sent and not yet answered, oldest first. */
  readonly pending: readonly CartChange[];
  /** The last failure, for the UI to report; cleared by the next change. */
  readonly error: string | null;
}

export type OptimisticCartAction<C extends OptimisticCartLike> =
  | { readonly type: "start"; readonly change: CartChange }
  | { readonly type: "succeed"; readonly changeId: string; readonly cart: C | null }
  | { readonly type: "fail"; readonly changeId: string; readonly message: string }
  /** A cart fetched or pushed from elsewhere (a refetch, a server render). */
  | { readonly type: "sync"; readonly cart: C | null };

export const initialOptimisticCart = <C extends OptimisticCartLike>(
  cart: C | null,
): OptimisticCartState<C> => ({ confirmed: cart, pending: [], error: null });

export const optimisticCartReducer = <C extends OptimisticCartLike>(
  state: OptimisticCartState<C>,
  action: OptimisticCartAction<C>,
): OptimisticCartState<C> => {
  switch (action.type) {
    case "start":
      return { ...state, pending: [...state.pending, action.change], error: null };
    case "succeed":
      return {
        confirmed: action.cart,
        pending: state.pending.filter((change) => change.id !== action.changeId),
        error: state.error,
      };
    case "fail":
      return {
        ...state,
        pending: state.pending.filter((change) => change.id !== action.changeId),
        error: action.message,
      };
    case "sync":
      return { ...state, confirmed: action.cart };
  }
};

/** A line's total at a new quantity, from its current total per unit. */
const scale = (money: Money, from: number, to: number): Money => ({
  amount: from > 0 ? ((Number(money.amount) / from) * to).toFixed(2) : "0.00",
  currencyCode: money.currencyCode,
});

const plus = (a: Money, b: Money): Money => ({
  amount: (Number(a.amount) + Number(b.amount)).toFixed(2),
  currencyCode: a.currencyCode,
});

/**
 * The cart the shopper should see: the confirmed cart with every pending
 * update and removal applied. Totals are estimates from each line's current
 * price per unit; Shopify's answer replaces them. Adds don't change lines.
 */
export const optimisticCart = <C extends OptimisticCartLike>(
  state: OptimisticCartState<C>,
): C | null => {
  const base = state.confirmed;
  if (!base) return null;
  const quantities = new Map(base.lines.nodes.map((line) => [line.id, line.quantity]));
  for (const change of state.pending) {
    if (change.kind === "update" && quantities.has(change.lineId))
      quantities.set(change.lineId, Math.max(0, change.quantity));
    if (change.kind === "remove") quantities.set(change.lineId, 0);
  }
  if (base.lines.nodes.every((line) => quantities.get(line.id) === line.quantity))
    return base;

  const lines = base.lines.nodes
    .filter((line) => (quantities.get(line.id) ?? 0) > 0)
    .map((line) => {
      const quantity = quantities.get(line.id) ?? line.quantity;
      return quantity === line.quantity
        ? line
        : {
            ...line,
            quantity,
            cost: {
              ...line.cost,
              totalAmount: scale(line.cost.totalAmount, line.quantity, quantity),
            },
          };
    });
  const subtotal = lines.reduce<Money>((sum, line) => plus(sum, line.cost.totalAmount), {
    amount: "0.00",
    currencyCode: base.cost.subtotalAmount.currencyCode,
  });

  return {
    ...base,
    totalQuantity: lines.reduce((sum, line) => sum + line.quantity, 0),
    cost: { ...base.cost, subtotalAmount: subtotal },
    lines: { ...base.lines, nodes: lines },
  };
};

/** Lines with a change in flight, so the UI can mark them busy. */
export const pendingLineIds = (
  state: OptimisticCartState<OptimisticCartLike>,
): ReadonlySet<string> =>
  new Set(
    state.pending.flatMap((change) => (change.kind === "add" ? [] : [change.lineId])),
  );

/** Items being added, for a badge that counts them before Shopify answers. */
export const pendingAddQuantity = (
  state: OptimisticCartState<OptimisticCartLike>,
): number =>
  state.pending.reduce(
    (sum, change) => sum + (change.kind === "add" ? change.quantity : 0),
    0,
  );
