/**
 * The value after `--<name>`, or undefined when the flag isn't given. A flag
 * given without a value (last, or followed by another flag) throws rather than
 * reading as absent: `perks x --segment --apply` must not quietly drop the
 * segment and write the perk to every subscription.
 */
export const flag = (args: readonly string[], name: string): string | undefined => {
  const index = args.indexOf(`--${name}`);
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (value === undefined || value.startsWith("--"))
    throw new Error(`--${name} needs a value.`);
  return value;
};
