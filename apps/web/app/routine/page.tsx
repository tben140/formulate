import { parseAnswers, scoreRoutine } from "@formulate/shopify";
import type { Metadata } from "next";

import { RoutineQuizForm } from "@/components/routine-quiz-form";
import { RoutineUnavailable, RoutineView, TalkToUs } from "@/components/routine-shared";
import { getRoutineGoals } from "@/lib/routine";

export const metadata: Metadata = {
  title: "Find your routine",
  description: "Four questions about your goals and preferences, and a routine to match.",
  alternates: { canonical: "/routine" },
};

/**
 * The routine quiz (SHO-161). Without answers, the questions; with complete
 * answers in the URL, the routine. `edit=1` shows the questions again,
 * pre-filled.
 */
const RoutinePage = async ({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}) => {
  const goals = await getRoutineGoals();
  if (goals.length === 0) return <RoutineUnavailable />;

  const raw = await searchParams;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    for (const item of Array.isArray(value) ? value : [value ?? ""])
      params.append(key, item);
  }
  const answers = parseAnswers(
    params,
    goals.map((goal) => goal.key),
  );
  const editing = params.get("edit") === "1";

  if (!answers || editing) {
    return (
      <div className="flex max-w-2xl flex-col gap-8">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold tracking-tight">Find your routine</h1>
          <p className="text-foreground-muted">
            Four quick questions about what you&apos;d like your routine to cover. We
            don&apos;t ask about your health.
          </p>
        </div>
        {params.has("goals") && !answers && !editing ? (
          <p role="alert" className="text-sm text-foreground">
            Choose at least one goal to see your routine.
          </p>
        ) : null}
        <RoutineQuizForm goals={goals} previous={answers} />
        <TalkToUs />
      </div>
    );
  }

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <h1 className="text-3xl font-semibold tracking-tight">Your suggested routine</h1>
      <RoutineView
        routine={scoreRoutine(answers, goals)}
        goals={goals}
        answers={answers}
        saved={false}
      />
    </div>
  );
};

export { RoutinePage as default };
