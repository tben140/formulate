/**
 * The home page's words, shared by web and the app (the theme's are section
 * settings, so the merchant can change them).
 *
 * The saving is read from a real product's plan (cardOffer), never written
 * down: if the plans change, the home page can't go on promising 15%.
 */

import { FREE_SHIPPING_THRESHOLD } from "./free-shipping";
import { formatMoney } from "./format-money";
import { GUARANTEE_TITLE } from "./guarantee";

export const HOME_HEADLINE = "Everyday supplements that never run out";

export const homeSubheading = (savingPercent: number | null): string =>
  savingPercent
    ? `Subscribe and save ${savingPercent}% on every delivery, with free UK delivery. Skip, pause or cancel any time.`
    : "Subscribe for free UK delivery on every order. Skip, pause or cancel any time.";

/** The strip of reasons under the hero, in order. */
export const homeBenefits = (savingPercent: number | null): readonly string[] => [
  savingPercent ? `Save ${savingPercent}% when you subscribe` : "Save when you subscribe",
  `Free UK delivery on subscriptions, and over ${formatMoney(FREE_SHIPPING_THRESHOLD).replace(/\.00$/, "")}`,
  "Skip, pause or cancel any time",
  GUARANTEE_TITLE,
];

/** The quiz's invitation, on the home page and wherever else it's offered. */
export const QUIZ_PROMPT = {
  title: "Not sure where to start?",
  body: "Answer a few quick questions and we'll suggest a daily routine to match.",
  cta: "Take the quiz",
  path: "/routine",
} as const;
