"use client";

import {
  formatMoney,
  type Routine,
  type RoutineGoal,
  type RoutineItem,
} from "@formulate/shopify";
import Link from "next/link";
import { useActionState, useEffect, useState } from "react";

import { addRoutineToCart } from "@/app/actions/routine";
import type { CartActionState } from "@/app/actions/cart";

import { useCartUi } from "./cart-provider";

const IDLE: CartActionState = { status: "idle" };

/**
 * A suggested routine the shopper can edit before adding: every product is
 * ticked, and unticking one takes it out of the total and the cart request.
 *
 * Wording stays factual (docs/claims-wording.md): "for your focus goal" names
 * the shopper's choice; nothing here says what a product does.
 */
export const RoutineResults = ({
  routine,
  goals,
}: {
  readonly routine: Routine;
  readonly goals: readonly RoutineGoal[];
}) => {
  const { openCart } = useCartUi();
  const [state, formAction, pending] = useActionState(addRoutineToCart, IDLE);
  const [ticked, setTicked] = useState<ReadonlySet<string>>(
    () => new Set(routine.items.map((item) => item.product.id)),
  );

  useEffect(() => {
    if (state.status === "success") openCart();
  }, [state.token, state.status, openCart]);

  const chosen = routine.items.filter((item) => ticked.has(item.product.id));
  const total = chosen.reduce((sum, item) => sum + item.product.monthlyPrice, 0);
  const currencyCode = routine.items[0]?.product.currencyCode ?? "GBP";
  const allSubscriptions = chosen.every((item) => item.product.sellingPlanId);

  const goalLabel = (key: string) =>
    goals.find((goal) => goal.key === key)?.label.toLowerCase() ?? key;
  const forGoals = (item: RoutineItem) =>
    `For your ${item.forGoals.map(goalLabel).join(" and ")} goal${item.forGoals.length > 1 ? "s" : ""}`;

  const toggle = (id: string) =>
    setTicked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <ul className="grid gap-3">
        {routine.items.map((item) => {
          const { product } = item;
          return (
            <li key={product.id}>
              <label className="flex items-center gap-4 rounded-md border border-border p-3 has-[:checked]:border-foreground">
                <input
                  type="checkbox"
                  name="item"
                  value={`${product.variantId}|${product.sellingPlanId ?? ""}|${encodeURIComponent(product.title)}`}
                  checked={ticked.has(product.id)}
                  onChange={() => toggle(product.id)}
                />
                {product.image ? (
                  // eslint-disable-next-line @next/next/no-img-element -- Shopify's CDN sizes it.
                  <img
                    src={`${product.image.url}${product.image.url.includes("?") ? "&" : "?"}width=128`}
                    alt=""
                    width={64}
                    height={64}
                    className="h-16 w-16 shrink-0 rounded bg-surface-muted object-cover"
                  />
                ) : null}
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="font-semibold text-foreground">{product.title}</span>
                  <span className="text-sm text-foreground-muted">{forGoals(item)}</span>
                </span>
                <span className="shrink-0 text-right text-sm">
                  <span className="block font-mono text-foreground">
                    {formatMoney({ amount: String(product.monthlyPrice), currencyCode })}
                  </span>
                  <span className="block text-foreground-muted">
                    {product.sellingPlanId ? "a month" : "one-off"}
                  </span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>

      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border pt-4">
        <p className="text-sm">
          <span className="font-semibold text-foreground">
            {formatMoney({ amount: String(Math.round(total * 100) / 100), currencyCode })}
          </span>{" "}
          <span className="text-foreground-muted">
            {allSubscriptions ? "a month, delivered every month" : "in total"}
          </span>
        </p>
        <button
          type="submit"
          disabled={pending || chosen.length === 0}
          className="rounded-md bg-foreground px-5 py-3 text-sm font-semibold text-surface hover:opacity-90 disabled:opacity-50"
        >
          {pending
            ? "Adding…"
            : allSubscriptions
              ? "Subscribe to this routine"
              : "Add to cart"}
        </button>
      </div>

      <p role="status" className="text-sm text-foreground-muted">
        {state.status === "error" ? state.message : (state.message ?? "")}
      </p>

      <p className="text-sm text-foreground-muted">
        Subscribed together, they renew on the same day. Skip, pause or cancel any time.
        Prefer to pick yourself?{" "}
        <Link href="/collections/best-sellers" className="underline underline-offset-4">
          Browse best sellers
        </Link>
        .
      </p>
    </form>
  );
};
