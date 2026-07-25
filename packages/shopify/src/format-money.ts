/**
 * Money formatting shared by both apps.
 *
 * `Intl.NumberFormat` is available in Node, browsers and Hermes (Expo enables
 * full ICU by default from SDK 50), so this needs no polyfill on either side.
 * The store trades in GBP, so en-GB is the sensible default locale.
 */

export interface MoneyLike {
  readonly amount: string;
  readonly currencyCode: string;
}

export const formatMoney = (money: MoneyLike, locale = "en-GB"): string => {
  const amount = Number(money.amount);

  if (Number.isNaN(amount)) return `${money.amount} ${money.currencyCode}`;

  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: money.currencyCode,
  }).format(amount);
};
