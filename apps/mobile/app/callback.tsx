import { Redirect } from "expo-router";

/**
 * Where Shopify's sign-in sends the buyer back: `shop.<shop id>.app://callback`.
 *
 * The sign-in sheet reads that URL itself (lib/customer-account.ts). On
 * Android, Expo Router sees the same incoming link too, and without this
 * route it would show the unmatched-route screen while sign-in finishes.
 * So it just goes back to the account tab, where the outcome shows.
 */
const Callback = () => <Redirect href="/account" />;

export { Callback as default };
