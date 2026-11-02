import blackFriday from "./templates/black-friday.json";
import januaryReset from "./templates/january-reset.json";
import summer from "./templates/summer.json";

/**
 * Starting points for a new campaign: everything but the dates, written once.
 * `{{year}}`, `{{starts}}`, `{{ends}}` and `{{ends_day}}` are filled from the
 * dates. Edit the copy in the admin afterwards; `campaigns check` then
 * catches wording that has drifted from the offer.
 */
export const TEMPLATES = {
  "black-friday": blackFriday,
  "january-reset": januaryReset,
  summer,
} as const;

export type TemplateName = keyof typeof TEMPLATES;

const uk = (at: Date, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", ...options }).format(at);

/** "00:00 on Friday 27 November 2026", as the Black Friday terms say it. */
const longTime = (at: Date) =>
  `${uk(at, { hour: "2-digit", minute: "2-digit" })} on ${uk(at, { weekday: "long" })} ${uk(
    at,
    {
      day: "numeric",
      month: "long",
      year: "numeric",
    },
  )}`;

/**
 * A template's fields for these dates, as metaobject field inputs. The end
 * is shown as the last minute the offer runs, so midnight reads as the day
 * before (as campaignEndsLabel does).
 */
export const templateFields = (
  name: TemplateName,
  startsAt: Date,
  endsAt: Date,
): { key: string; value: string }[] => {
  const template: Record<string, unknown> = TEMPLATES[name];
  const last = new Date(endsAt.getTime() - 60_000);
  const fill = (text: string) =>
    text
      .replaceAll("{{year}}", uk(startsAt, { year: "numeric" }))
      .replaceAll("{{starts}}", longTime(startsAt))
      .replaceAll("{{ends}}", longTime(last))
      .replaceAll("{{ends_day}}", uk(last, { weekday: "long" }));
  const fields = Object.entries(template)
    .filter(([, value]) => value !== "")
    .map(([key, value]) => ({
      key,
      value: typeof value === "string" ? fill(value) : JSON.stringify(value),
    }));
  return [
    ...fields,
    { key: "starts_at", value: startsAt.toISOString() },
    { key: "ends_at", value: endsAt.toISOString() },
  ];
};
