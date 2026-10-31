import { randomInt } from "node:crypto";

/**
 * Personal discount codes (SHO-169): one per email recipient, so a code can't
 * spread to voucher sites the way one shared code does. `campaigns codes`
 * makes them, on a second code discount on the campaign Function (its config
 * marked `pool: "personal"`), and uploads the same codes to a Klaviyo coupon,
 * which the email inserts one per person ({% coupon_code '<id>' %}).
 */

/** No 0/O, 1/I/L: codes get read aloud and typed from a phone. */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 8;

/** The pool marker in a personal-code discount's config. */
export const PERSONAL_POOL = "personal";

/**
 * `count` distinct codes, each `PREFIX-XXXXXXXX`, from a cryptographic
 * source: 31^8 (about 8.5 × 10^11) per prefix, so guessing one is hopeless.
 */
export const generateCodes = (
  count: number,
  prefix: string,
  pick: (max: number) => number = randomInt,
): string[] => {
  if (!/^[A-Z0-9]{1,12}$/.test(prefix))
    throw new Error("Prefixes are 1–12 capitals and digits.");
  if (!Number.isInteger(count) || count < 1 || count > 20000)
    throw new Error("--count is 1 to 20,000.");
  const codes = new Set<string>();
  while (codes.size < count) {
    let body = "";
    for (let i = 0; i < CODE_LENGTH; i++) body += ALPHABET[pick(ALPHABET.length)];
    codes.add(`${prefix}-${body}`);
  }
  return [...codes];
};

/** Whether a Function discount's config is the personal-code pool. */
export const isPersonalPool = (config: unknown): boolean =>
  (config as { pool?: unknown } | null)?.pool === PERSONAL_POOL;
