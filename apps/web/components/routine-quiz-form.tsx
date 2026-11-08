import {
  BUDGETS,
  MAX_GOALS,
  type QuizAnswers,
  type RoutineGoal,
} from "@formulate/shopify";

/**
 * The routine quiz: four questions on one page, as a plain GET form.
 *
 * No JavaScript needed: submitting puts the answers in the URL, and the page
 * renders the result on the server. That also makes a result a shareable link.
 *
 * ⚠️ Goals, never symptoms (ADR 0009). The goal labels come from Shopify;
 * keep any copy here about what the shopper wants, not what's wrong.
 */
export const RoutineQuizForm = ({
  goals,
  previous,
}: {
  readonly goals: readonly RoutineGoal[];
  readonly previous: QuizAnswers | null;
}) => {
  const legend = "text-base font-semibold text-foreground";
  const option =
    "flex items-center gap-3 rounded-md border border-border px-4 py-3 text-sm has-[:checked]:border-foreground has-[:focus-visible]:outline has-[:focus-visible]:outline-2";

  return (
    <form method="get" action="/routine" className="flex flex-col gap-8">
      <fieldset className="flex flex-col gap-3">
        <legend className={legend}>What would you like your routine to cover?</legend>
        <p className="text-sm text-foreground-muted">Choose up to {MAX_GOALS}.</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {goals.map((goal) => (
            <label key={goal.key} className={option}>
              <input
                type="checkbox"
                name="goals"
                value={goal.key}
                defaultChecked={previous?.goals.includes(goal.key)}
              />
              {goal.label}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className={legend}>Any dietary preference?</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {(
            [
              ["none", "No preference"],
              ["vegetarian", "Vegetarian"],
              ["vegan", "Vegan"],
            ] as const
          ).map(([value, label]) => (
            <label key={value} className={option}>
              <input
                type="radio"
                name="diet"
                value={value}
                required
                defaultChecked={(previous?.diet ?? "none") === value}
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className={legend}>Capsules or powders?</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {(
            [
              ["", "Either is fine"],
              ["capsules", "Capsules and tablets"],
              ["powders", "Powders and sticks"],
            ] as const
          ).map(([value, label]) => (
            <label key={value || "either"} className={option}>
              <input
                type="radio"
                name="format"
                value={value}
                defaultChecked={(previous?.format ?? "") === value}
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className={legend}>Monthly budget</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {Object.entries(BUDGETS).map(([value, { label }]) => (
            <label key={value} className={option}>
              <input
                type="radio"
                name="budget"
                value={value}
                required
                defaultChecked={(previous?.budget ?? "any") === value}
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <button
          type="submit"
          className="rounded-md bg-foreground px-5 py-3 text-sm font-semibold text-surface hover:opacity-90"
        >
          See my routine
        </button>
      </div>
    </form>
  );
};
