import Link from "next/link";

import { getRoutineGoals } from "@/lib/routine";

/**
 * The routine quiz's entry point below a collection and on an empty search
 * (SHO-161): the places a shopper is choosing, or stuck. Not on product
 * pages, where it would pull someone away from a product they've picked.
 *
 * Hidden until the quiz's goals exist in Shopify, the same rule as the home
 * page's button, so it never links to a quiz with nothing to ask.
 */
export const RoutinePrompt = async () => {
  const goals = await getRoutineGoals();
  if (goals.length === 0) return null;
  return (
    <aside
      aria-labelledby="routine-prompt"
      className="mt-12 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border px-6 py-6"
    >
      <div>
        <h2 id="routine-prompt" className="text-xl font-semibold tracking-tight">
          Not sure where to start?
        </h2>
        <p className="mt-1 text-foreground-muted">
          Answer four questions and we&apos;ll suggest a routine.
        </p>
      </div>
      <Link
        href="/routine"
        className="inline-block rounded-md border border-foreground px-6 py-3 font-semibold text-foreground hover:bg-surface-muted"
      >
        Find your routine
      </Link>
    </aside>
  );
};
