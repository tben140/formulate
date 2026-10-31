import { scoreRoutine } from "@formulate/shopify";
import type { Metadata } from "next";
import Link from "next/link";

import { RoutineUnavailable, RoutineView } from "@/components/routine-shared";
import { getRoutineGoals, readSavedAnswers } from "@/lib/routine";

export const metadata: Metadata = {
  title: "Your routine",
  robots: { index: false, follow: false },
};

/**
 * "Your routine": the saved answers, scored against today's products and
 * prices, so it follows changes made in Shopify. Kept in a cookie for now;
 * signed-in shoppers can have it on their account once sign-in (#76) lands.
 */
const YourRoutinePage = async () => {
  const goals = await getRoutineGoals();
  if (goals.length === 0) return <RoutineUnavailable />;

  const answers = await readSavedAnswers(goals);

  if (!answers) {
    return (
      <div className="flex max-w-2xl flex-col gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">Your routine</h1>
        <p className="text-foreground-muted">You haven&apos;t saved a routine yet.</p>
        <Link href="/routine" className="text-sm underline underline-offset-4">
          Find your routine
        </Link>
      </div>
    );
  }

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <h1 className="text-3xl font-semibold tracking-tight">Your routine</h1>
      <RoutineView
        routine={scoreRoutine(answers, goals)}
        goals={goals}
        answers={answers}
        saved
      />
    </div>
  );
};

export { YourRoutinePage as default };
