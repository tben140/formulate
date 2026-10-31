import {
  serializeAnswers,
  type QuizAnswers,
  type Routine,
  type RoutineGoal,
} from "@formulate/shopify";
import Link from "next/link";

import { forgetRoutine, saveRoutine } from "@/app/actions/routine";
import { CONTACT_EMAIL } from "@/lib/routine";

import { RoutineResults } from "./routine-results";

/** "Talk to us": the quiz's alternative to a free-text box (SHO-161). */
export const TalkToUs = () =>
  CONTACT_EMAIL ? (
    <p className="text-sm text-foreground-muted">
      Not sure, or none of these fit? Talk to us at{" "}
      <a href={`mailto:${CONTACT_EMAIL}`} className="underline underline-offset-4">
        {CONTACT_EMAIL}
      </a>
      .
    </p>
  ) : null;

/** The not-yet-set-up state: no goals in Shopify yet. */
export const RoutineUnavailable = () => (
  <div className="flex flex-col gap-3">
    <h1 className="text-3xl font-semibold tracking-tight">Find your routine</h1>
    <p className="text-foreground-muted">
      The routine finder isn&apos;t ready yet. In the meantime,{" "}
      <Link href="/collections/best-sellers" className="underline underline-offset-4">
        browse our best sellers
      </Link>
      .
    </p>
  </div>
);

/** A routine, with its actions: edit answers, save or forget, add to cart. */
export const RoutineView = ({
  routine,
  goals,
  answers,
  saved,
}: {
  readonly routine: Routine;
  readonly goals: readonly RoutineGoal[];
  readonly answers: QuizAnswers;
  /** Shown on "Your routine": offers to forget instead of to save. */
  readonly saved: boolean;
}) => {
  const query = serializeAnswers(answers);
  const link = "text-sm underline underline-offset-4";

  if (routine.items.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-foreground-muted">
          Nothing matched those answers
          {routine.leftOutForBudget > 0 ? " within that budget" : ""}. Try a different
          budget or dietary preference.
        </p>
        <Link href={`/routine?${query}&edit=1`} className={link}>
          Change my answers
        </Link>
        <TalkToUs />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {routine.leftOutForBudget > 0 ? (
        <p className="text-sm text-foreground-muted">
          {routine.leftOutForBudget === 1
            ? "One more product matched but didn't fit your budget."
            : `${routine.leftOutForBudget} more products matched but didn't fit your budget.`}
        </p>
      ) : null}

      <RoutineResults routine={routine} goals={goals} />

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <Link href={`/routine?${query}&edit=1`} className={link}>
          Change my answers
        </Link>
        {saved ? (
          <form action={forgetRoutine}>
            <button type="submit" className={link}>
              Forget my routine
            </button>
          </form>
        ) : (
          <form action={saveRoutine}>
            <input type="hidden" name="answers" value={query} />
            <button type="submit" className={link}>
              Save my routine
            </button>
          </form>
        )}
      </div>

      <TalkToUs />
    </div>
  );
};
