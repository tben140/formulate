import "server-only";

import {
  parseAnswers,
  RoutineGoalsQuery,
  serializeAnswers,
  toRoutineGoals,
  type QuizAnswers,
  type RoutineGoal,
} from "@formulate/shopify";
import { cookies } from "next/headers";
import { cache } from "react";

import { storefront } from "./storefront";

/**
 * The routine quiz's data and the saved routine (SHO-161).
 *
 * Goals and their products come from Shopify (`routine_goal` metaobjects), so
 * an empty list means the store hasn't been set up yet, not an error.
 */
export const getRoutineGoals = cache(async (): Promise<readonly RoutineGoal[]> => {
  const result = await storefront.request(RoutineGoalsQuery);
  if (!result.ok) {
    console.error("[routine] goals query failed", result.error);
    return [];
  }
  return toRoutineGoals(result.data);
});

/**
 * The shopper's saved answers, so "Your routine" shows their routine with
 * today's products and prices.
 *
 * Only answers are stored, never products, so a routine follows changes in
 * Shopify. The cookie is set only when the shopper presses "Save my routine",
 * so it's a feature they asked for (functional), not tracking: it isn't sent
 * anywhere and isn't behind the consent banner. Goals, not health data
 * (ADR 0009).
 */
const ROUTINE_COOKIE = "dh_routine";
const ROUTINE_MAX_AGE = 60 * 60 * 24 * 365;

export const readSavedAnswers = async (
  goals: readonly RoutineGoal[],
): Promise<QuizAnswers | null> => {
  const value = (await cookies()).get(ROUTINE_COOKIE)?.value;
  if (!value) return null;
  return parseAnswers(
    new URLSearchParams(value),
    goals.map((goal) => goal.key),
  );
};

export const writeSavedAnswers = async (answers: QuizAnswers): Promise<void> => {
  (await cookies()).set(ROUTINE_COOKIE, serializeAnswers(answers), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: ROUTINE_MAX_AGE,
  });
};

export const clearSavedAnswers = async (): Promise<void> => {
  (await cookies()).delete(ROUTINE_COOKIE);
};

/**
 * Where "Talk to us" goes: an email address, from the server-only
 * `CONTACT_EMAIL`. Unset hides the link rather than inventing an address.
 */
export const CONTACT_EMAIL = process.env.CONTACT_EMAIL?.trim() || null;
