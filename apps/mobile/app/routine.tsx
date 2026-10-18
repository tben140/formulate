import {
  BUDGETS,
  formatMoney,
  MAX_GOALS,
  scoreRoutine,
  serializeAnswers,
  type Budget,
  type Diet,
  type FormatPreference,
  type QuizAnswers,
  type RoutineGoal,
  type RoutineItem,
} from "@formulate/shopify";
import { Image } from "expo-image";
import { Link } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";

import { useCartUi } from "../components/cart-provider";
import { useRoutineGoals } from "../lib/queries";
import {
  clearSavedAnswers,
  readSavedAnswers,
  writeSavedAnswers,
} from "../lib/routine-storage";
import { useAddToCart } from "../lib/use-cart";

/**
 * The routine quiz (SHO-161), matching web's /routine: the same questions,
 * the same scoring from packages/shopify, results the shopper can edit, and a
 * routine they can save on the phone.
 *
 * ⚠️ Goals, never symptoms (ADR 0009). Goal labels come from Shopify. Copy
 * stays factual (docs/claims-wording.md).
 */

const CONTACT_EMAIL = process.env.EXPO_PUBLIC_CONTACT_EMAIL?.trim() || null;

const DIET_CHOICES: readonly [Diet, string][] = [
  ["none", "No preference"],
  ["vegetarian", "Vegetarian"],
  ["vegan", "Vegan"],
];
const FORMAT_CHOICES: readonly [FormatPreference | null, string][] = [
  [null, "Either is fine"],
  ["capsules", "Capsules and tablets"],
  ["powders", "Powders and sticks"],
];

const Choice = ({
  label,
  selected,
  onPress,
  role,
}: {
  readonly label: string;
  readonly selected: boolean;
  readonly onPress: () => void;
  readonly role: "checkbox" | "radio";
}) => (
  <Pressable
    onPress={onPress}
    accessibilityRole={role}
    accessibilityState={role === "checkbox" ? { checked: selected } : { selected }}
    className={`rounded-md border px-4 py-3 ${selected ? "border-foreground bg-surface-muted" : "border-border"}`}
  >
    <Text className="text-base text-foreground">{label}</Text>
  </Pressable>
);

const Question = ({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) => (
  <View className="gap-2">
    <Text accessibilityRole="header" className="text-base font-semibold text-foreground">
      {title}
    </Text>
    {hint ? <Text className="text-sm text-foreground-muted">{hint}</Text> : null}
    <View className="gap-2">{children}</View>
  </View>
);

const TalkToUs = () =>
  CONTACT_EMAIL ? (
    <Pressable
      accessibilityRole="link"
      onPress={() => void Linking.openURL(`mailto:${CONTACT_EMAIL}`)}
    >
      <Text className="text-sm text-foreground-muted">
        Not sure, or none of these fit? Talk to us at{" "}
        <Text className="underline">{CONTACT_EMAIL}</Text>
      </Text>
    </Pressable>
  ) : null;

const QuizForm = ({
  goals,
  initial,
  onDone,
}: {
  readonly goals: readonly RoutineGoal[];
  readonly initial: QuizAnswers | null;
  readonly onDone: (answers: QuizAnswers) => void;
}) => {
  const [picked, setPicked] = useState<readonly string[]>(initial?.goals ?? []);
  const [diet, setDiet] = useState<Diet>(initial?.diet ?? "none");
  const [format, setFormat] = useState<FormatPreference | null>(initial?.format ?? null);
  const [budget, setBudget] = useState<Budget>(initial?.budget ?? "any");

  const toggleGoal = (key: string) =>
    setPicked((current) =>
      current.includes(key)
        ? current.filter((goal) => goal !== key)
        : current.length < MAX_GOALS
          ? [...current, key]
          : current,
    );

  return (
    <View className="gap-6">
      <Question
        title="What would you like your routine to cover?"
        hint={`Choose up to ${MAX_GOALS}.`}
      >
        {goals.map((goal) => (
          <Choice
            key={goal.key}
            role="checkbox"
            label={goal.label}
            selected={picked.includes(goal.key)}
            onPress={() => toggleGoal(goal.key)}
          />
        ))}
      </Question>
      <Question title="Any dietary preference?">
        {DIET_CHOICES.map(([value, label]) => (
          <Choice
            key={value}
            role="radio"
            label={label}
            selected={diet === value}
            onPress={() => setDiet(value)}
          />
        ))}
      </Question>
      <Question title="Capsules or powders?">
        {FORMAT_CHOICES.map(([value, label]) => (
          <Choice
            key={label}
            role="radio"
            label={label}
            selected={format === value}
            onPress={() => setFormat(value)}
          />
        ))}
      </Question>
      <Question title="Monthly budget">
        {(Object.entries(BUDGETS) as [Budget, { label: string }][]).map(
          ([value, { label }]) => (
            <Choice
              key={value}
              role="radio"
              label={label}
              selected={budget === value}
              onPress={() => setBudget(value)}
            />
          ),
        )}
      </Question>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: picked.length === 0 }}
        disabled={picked.length === 0}
        onPress={() => onDone({ goals: picked, diet, format, budget })}
        className={`self-start rounded-md bg-brand-600 px-5 py-3 ${picked.length === 0 ? "opacity-50" : ""}`}
      >
        <Text className="font-semibold text-surface">See my routine</Text>
      </Pressable>
      {picked.length === 0 ? (
        <Text className="text-sm text-foreground-muted">
          Choose at least one goal to see your routine.
        </Text>
      ) : null}
    </View>
  );
};

const Results = ({
  goals,
  answers,
  saved,
  onEdit,
  onSave,
  onForget,
}: {
  readonly goals: readonly RoutineGoal[];
  readonly answers: QuizAnswers;
  readonly saved: boolean;
  readonly onEdit: () => void;
  readonly onSave: () => void;
  readonly onForget: () => void;
}) => {
  const routine = useMemo(() => scoreRoutine(answers, goals), [answers, goals]);
  const [ticked, setTicked] = useState<ReadonlySet<string>>(
    () => new Set(routine.items.map((item) => item.product.id)),
  );

  const addToCart = useAddToCart();
  const { openCart } = useCartUi();

  const chosen = routine.items.filter((item) => ticked.has(item.product.id));
  const total =
    Math.round(chosen.reduce((sum, item) => sum + item.product.monthlyPrice, 0) * 100) /
    100;
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

  const link = "text-sm text-foreground underline";

  if (routine.items.length === 0) {
    return (
      <View className="gap-3">
        <Text className="text-base text-foreground-muted">
          Nothing matched those answers
          {routine.leftOutForBudget > 0 ? " within that budget" : ""}. Try a different
          budget or dietary preference.
        </Text>
        <Pressable accessibilityRole="button" onPress={onEdit}>
          <Text className={link}>Change my answers</Text>
        </Pressable>
        <TalkToUs />
      </View>
    );
  }

  return (
    <View className="gap-4">
      {routine.leftOutForBudget > 0 ? (
        <Text className="text-sm text-foreground-muted">
          {routine.leftOutForBudget === 1
            ? "One more product matched but didn't fit your budget."
            : `${routine.leftOutForBudget} more products matched but didn't fit your budget.`}
        </Text>
      ) : null}

      {routine.items.map((item) => {
        const { product } = item;
        const on = ticked.has(product.id);
        return (
          <Pressable
            key={product.id}
            onPress={() => toggle(product.id)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: on }}
            accessibilityLabel={`${product.title}. ${forGoals(item)}. ${formatMoney({
              amount: String(product.monthlyPrice),
              currencyCode,
            })} ${product.sellingPlanId ? "a month" : "one-off"}.`}
            className={`flex-row items-center gap-3 rounded-md border p-3 ${on ? "border-foreground" : "border-border opacity-60"}`}
          >
            <View
              className={`h-5 w-5 items-center justify-center rounded border ${on ? "border-foreground bg-foreground" : "border-ink-400"}`}
            >
              {on ? <Text className="text-xs text-surface">✓</Text> : null}
            </View>
            {product.image ? (
              <Image
                source={`${product.image.url}${product.image.url.includes("?") ? "&" : "?"}width=128`}
                style={{ width: 56, height: 56, borderRadius: 6 }}
                accessible={false}
              />
            ) : null}
            <View className="min-w-0 flex-1">
              <Text className="font-semibold text-foreground">{product.title}</Text>
              <Text className="text-sm text-foreground-muted">{forGoals(item)}</Text>
            </View>
            <View className="items-end">
              <Text className="font-mono text-foreground">
                {formatMoney({ amount: String(product.monthlyPrice), currencyCode })}
              </Text>
              <Text className="text-xs text-foreground-muted">
                {product.sellingPlanId ? "a month" : "one-off"}
              </Text>
            </View>
          </Pressable>
        );
      })}

      <View className="gap-3 border-t border-border pt-4">
        <Text className="text-base text-foreground">
          <Text className="font-semibold">
            {formatMoney({ amount: String(total), currencyCode })}
          </Text>{" "}
          <Text className="text-foreground-muted">
            {allSubscriptions ? "a month, delivered every month" : "in total"}
          </Text>
        </Text>
        <Pressable
          accessibilityRole="button"
          disabled={chosen.length === 0 || addToCart.isPending}
          accessibilityState={{
            disabled: chosen.length === 0,
            busy: addToCart.isPending,
          }}
          onPress={() =>
            addToCart.mutate(
              chosen.map(({ product }) => ({
                merchandiseId: product.variantId,
                quantity: 1,
                ...(product.sellingPlanId
                  ? { sellingPlanId: product.sellingPlanId }
                  : {}),
              })),
              { onSuccess: () => openCart() },
            )
          }
          className={`self-start rounded-md bg-brand-600 px-5 py-3 ${chosen.length === 0 ? "opacity-50" : ""}`}
        >
          <Text className="font-semibold text-surface">
            {addToCart.isPending
              ? "Adding…"
              : allSubscriptions
                ? "Subscribe to this routine"
                : "Add to cart"}
          </Text>
        </Pressable>
        <Text accessibilityLiveRegion="polite" className="text-sm text-foreground-muted">
          {addToCart.isError ? addToCart.error.message : (addToCart.data?.notice ?? "")}
        </Text>
      </View>

      <Text className="text-sm text-foreground-muted">
        Subscriptions can be skipped, paused or cancelled any time.
      </Text>

      <View className="flex-row flex-wrap gap-x-6 gap-y-2">
        <Pressable accessibilityRole="button" onPress={onEdit}>
          <Text className={link}>Change my answers</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={saved ? onForget : onSave}>
          <Text className={link}>{saved ? "Forget my routine" : "Save my routine"}</Text>
        </Pressable>
      </View>

      <TalkToUs />
    </View>
  );
};

const RoutineScreen = () => {
  const { data: goals, isPending, isError } = useRoutineGoals();
  const [answers, setAnswers] = useState<QuizAnswers | null>(null);
  const [saved, setSaved] = useState(false);
  const [editing, setEditing] = useState(false);
  const [loadedSaved, setLoadedSaved] = useState(false);

  // A saved routine opens straight to its results.
  useEffect(() => {
    if (!goals || loadedSaved) return;
    void readSavedAnswers(goals.map((goal) => goal.key)).then((stored) => {
      if (stored) {
        setAnswers(stored);
        setSaved(true);
      }
      setLoadedSaved(true);
    });
  }, [goals, loadedSaved]);

  if (isPending || (goals && !loadedSaved)) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator accessibilityLabel="Loading" />
      </View>
    );
  }

  if (isError || !goals || goals.length === 0) {
    return (
      <View className="gap-3 p-4">
        <Text
          accessibilityRole="header"
          className="text-2xl font-semibold text-foreground"
        >
          Find your routine
        </Text>
        <Text className="text-base text-foreground-muted">
          The routine finder isn&apos;t ready yet. In the meantime, browse our best
          sellers.
        </Text>
        <Link
          href="/collections/best-sellers"
          className="text-sm text-foreground underline"
        >
          Best sellers
        </Link>
      </View>
    );
  }

  const showQuiz = !answers || editing;

  return (
    <ScrollView contentContainerClassName="gap-6 p-4 pb-12">
      <View className="gap-2">
        <Text
          accessibilityRole="header"
          className="text-2xl font-semibold text-foreground"
        >
          {showQuiz
            ? "Find your routine"
            : saved
              ? "Your routine"
              : "Your suggested routine"}
        </Text>
        {showQuiz ? (
          <Text className="text-base text-foreground-muted">
            Four quick questions about what you&apos;d like your routine to cover. We
            don&apos;t ask about your health.
          </Text>
        ) : null}
      </View>

      {showQuiz ? (
        <>
          <QuizForm
            goals={goals}
            initial={answers}
            onDone={(next) => {
              setAnswers(next);
              setEditing(false);
              setSaved(false);
            }}
          />
          <TalkToUs />
        </>
      ) : (
        // Remounted per set of answers, so every product starts ticked.
        <Results
          key={serializeAnswers(answers)}
          goals={goals}
          answers={answers}
          saved={saved}
          onEdit={() => setEditing(true)}
          onSave={() => void writeSavedAnswers(answers).then(() => setSaved(true))}
          onForget={() =>
            void clearSavedAnswers().then(() => {
              setSaved(false);
              setAnswers(null);
            })
          }
        />
      )}
    </ScrollView>
  );
};

export { RoutineScreen as default };
