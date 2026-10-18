import { parseAnswers, serializeAnswers, type QuizAnswers } from "@formulate/shopify";
import * as SecureStore from "expo-secure-store";

/**
 * The saved routine on the phone (SHO-161): only the answers, so "Your
 * routine" follows today's products and prices. Saved only when the shopper
 * taps "Save my routine", and never sent anywhere: a feature they asked for,
 * not tracking. Goals, not health data (ADR 0009).
 *
 * The keychain because it's what the app already uses; the value isn't
 * secret. On the web build secure-store is unavailable, so reads and writes
 * quietly do nothing there.
 */
const ROUTINE_KEY = "formulate.routine.answers";

export const readSavedAnswers = async (
  knownGoals: readonly string[],
): Promise<QuizAnswers | null> => {
  try {
    const value = await SecureStore.getItemAsync(ROUTINE_KEY);
    return value ? parseAnswers(new URLSearchParams(value), knownGoals) : null;
  } catch {
    return null;
  }
};

export const writeSavedAnswers = async (answers: QuizAnswers): Promise<void> => {
  try {
    await SecureStore.setItemAsync(ROUTINE_KEY, serializeAnswers(answers));
  } catch {
    // Unavailable (the web build): the routine still works, it just isn't kept.
  }
};

export const clearSavedAnswers = async (): Promise<void> => {
  try {
    await SecureStore.deleteItemAsync(ROUTINE_KEY);
  } catch {
    // As above.
  }
};
