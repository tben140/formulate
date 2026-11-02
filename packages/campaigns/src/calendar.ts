import { campaignOf } from "./campaign-node";
import type { CampaignEntry } from "./types";

/** The theme reads the first 50 campaigns only (docs/campaigns.md, Housekeeping). */
export const THEME_LIMIT = 50;

export interface CalendarRow {
  readonly handle: string;
  readonly title: string;
  readonly state: "upcoming" | "live" | "ended" | "draft" | "invalid";
  readonly startsAt: string | null;
  readonly endsAt: string | null;
  readonly audience: string;
}

/**
 * Every campaign, in date order, and what needs attention: two running at
 * once (only the one ending soonest gets the banner, and a product can only
 * be in one), ended ones still in the store, and the theme's limit.
 */
export const calendar = (
  entries: readonly CampaignEntry[],
  now: Date = new Date(),
): { readonly rows: CalendarRow[]; readonly notes: string[] } => {
  const rows: CalendarRow[] = entries.map((entry) => {
    const campaign = campaignOf(entry);
    return {
      handle: entry.handle,
      title: entry.fields.title ?? entry.handle,
      state: !campaign
        ? "invalid"
        : !entry.published
          ? "draft"
          : now < campaign.startsAt
            ? "upcoming"
            : now < campaign.endsAt
              ? "live"
              : "ended",
      startsAt: campaign?.startsAt.toISOString() ?? null,
      endsAt: campaign?.endsAt.toISOString() ?? null,
      audience: campaign?.audience === "email_link" ? "email link" : "everyone",
    };
  });
  // Undated (invalid) entries last; ISO timestamps compare as strings.
  rows.sort((a, b) =>
    a.startsAt === b.startsAt
      ? 0
      : a.startsAt === null
        ? 1
        : b.startsAt === null
          ? -1
          : a.startsAt < b.startsAt
            ? -1
            : 1,
  );

  const notes: string[] = [];
  const dated = rows.filter((row) => row.startsAt && row.endsAt && row.state !== "ended");
  for (let i = 0; i < dated.length; i++) {
    for (let j = i + 1; j < dated.length; j++) {
      const a = dated[i]!;
      const b = dated[j]!;
      if (a.startsAt! < b.endsAt! && b.startsAt! < a.endsAt!)
        notes.push(
          `${a.handle} and ${b.handle} overlap: only the one ending first gets the banner, and a product can be in one campaign only.`,
        );
    }
  }
  const ended = rows.filter((row) => row.state === "ended");
  if (ended.length > 0)
    notes.push(
      `Ended, to delete with their collections and discounts: ${ended.map((r) => r.handle).join(", ")}.`,
    );
  const invalid = rows.filter((row) => row.state === "invalid");
  if (invalid.length > 0)
    notes.push(
      `Can't be shown (missing fields or dates): ${invalid.map((r) => r.handle).join(", ")}.`,
    );
  if (rows.length > THEME_LIMIT)
    notes.push(
      `${rows.length} campaigns: the theme reads the first ${THEME_LIMIT} only, so a live one may be missed.`,
    );
  return { rows, notes };
};

/** The calendar as a Markdown table, for the terminal or a doc. */
export const calendarMarkdown = (result: ReturnType<typeof calendar>): string => {
  const day = (iso: string | null) => (iso ? iso.slice(0, 16).replace("T", " ") : "—");
  const lines = [
    "| Campaign | State | Starts (UTC) | Ends (UTC) | Audience |",
    "| -------- | ----- | ------------ | ---------- | -------- |",
    ...result.rows.map(
      (row) =>
        `| ${row.title} (\`${row.handle}\`) | ${row.state} | ${day(row.startsAt)} | ${day(row.endsAt)} | ${row.audience} |`,
    ),
  ];
  if (result.notes.length > 0) lines.push("", ...result.notes.map((note) => `- ${note}`));
  return lines.join("\n");
};
