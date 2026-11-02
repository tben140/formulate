/**
 * The UK retail calendar the campaign calendar overlays (SHO-205): the dates
 * shoppers expect offers around, so gaps and clashes show at a glance. Dates
 * are UK calendar days ("2026-11-27"). Prime Day and back-to-school are left
 * out: their dates change each year and aren't ours to guess.
 */

export interface RetailDay {
  /** "2026-11-27" */
  readonly date: string;
  readonly name: string;
}

const iso = (year: number, month: number, day: number) =>
  `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

/** Easter Sunday (Gregorian), by the anonymous Gregorian algorithm. */
export const easterSunday = (year: number): string => {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return iso(year, month, day);
};

const addDays = (date: string, days: number): string => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/** The nth weekday (0 = Sunday) of a month, 1-based. */
const nthWeekday = (year: number, month: number, weekday: number, n: number): string => {
  const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const day = 1 + ((weekday - first + 7) % 7) + (n - 1) * 7;
  return iso(year, month, day);
};

export const retailDays = (year: number): RetailDay[] => {
  const easter = easterSunday(year);
  // US Thanksgiving: the 4th Thursday of November; Black Friday is the day after.
  const thanksgiving = nthWeekday(year, 11, 4, 4);
  const blackFriday = addDays(thanksgiving, 1);
  return [
    { date: iso(year, 1, 1), name: "New Year's Day (January sales)" },
    { date: iso(year, 2, 14), name: "Valentine's Day" },
    // Mothering Sunday: the fourth Sunday of Lent, three weeks before Easter.
    { date: addDays(easter, -21), name: "Mother's Day (UK)" },
    { date: addDays(easter, -2), name: "Good Friday" },
    { date: easter, name: "Easter Sunday" },
    { date: addDays(easter, 1), name: "Easter Monday" },
    { date: nthWeekday(year, 6, 0, 3), name: "Father's Day (UK)" },
    { date: iso(year, 10, 31), name: "Halloween" },
    { date: blackFriday, name: "Black Friday" },
    { date: addDays(blackFriday, 3), name: "Cyber Monday" },
    { date: iso(year, 12, 25), name: "Christmas Day" },
    { date: iso(year, 12, 26), name: "Boxing Day (sales start)" },
  ];
};
