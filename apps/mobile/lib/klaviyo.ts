import {
  looksFakeToKlaviyo,
  submitSubscription,
  type SubscribeResult,
} from "@formulate/analytics";
import * as SecureStore from "expo-secure-store";

/**
 * Klaviyo for the Expo app.
 *
 * ⚠️ **The second half of this works differently here, and it is the only
 * genuinely interesting thing about the mobile implementation.**
 *
 * On web and theme, subscribing is followed by `_learnq.push(["identify"])` —
 * a call into the copy of `klaviyo.js` running in the page, which is what
 * releases the events it has been caching all session. That call is the whole
 * reason email capture blocks the analytics work on those surfaces.
 *
 * None of that exists on native. There is no `klaviyo.js`, no `__kla_id`
 * cookie, and therefore nothing caching events and nothing to flush. Klaviyo
 * ships a React Native SDK, but adopting it means another native module and
 * another development build to demonstrate what plain HTTP already does — see
 * docs/integration-klaviyo.md.
 *
 * So identification is **ours to store**. The subscribed address is what a
 * later `POST /client/events/` will attach its events to (SHO-109); without it
 * persisted, every event this app sends would create an orphan profile, which
 * is the native equivalent of the same silent failure.
 *
 * Same endpoint, same payload, same shared code as the other two surfaces.
 * Only the identity mechanism diverges, because the platform gives us nothing
 * to hand it to.
 */

/**
 * Public by design, and inlined into the bundle by Metro at build time.
 *
 * `EXPO_PUBLIC_` is required rather than stylistic: the bundle *is* the
 * client. Klaviyo's onsite key is scoped to writing events and subscriptions
 * for one account, which is exactly what may ship this way. A Klaviyo
 * **private** key must never appear in this app — there is no server here to
 * hide it behind, so it would reach every device.
 */
export const KLAVIYO_PUBLIC_KEY = process.env.EXPO_PUBLIC_KLAVIYO_PUBLIC_KEY ?? "";
export const KLAVIYO_LIST_ID = process.env.EXPO_PUBLIC_KLAVIYO_LIST_ID ?? "";

/**
 * Where the identified address lives on device.
 *
 * The OS keychain, alongside the cart id. Not because an email is a bearer
 * token — it is not — but because it is personal data, `expo-secure-store` is
 * already a dependency, and the alternative would mean adding AsyncStorage to
 * store one string less carefully.
 */
const EMAIL_KEY = "formulate.klaviyo.email";

/**
 * The address this device is identified as, if any.
 *
 * Read by whatever sends events (SHO-109), so they attach to a real profile
 * rather than creating an anonymous one per event.
 */
export const readIdentifiedEmail = (): Promise<string | null> =>
  SecureStore.getItemAsync(EMAIL_KEY);

export const clearIdentifiedEmail = (): Promise<void> =>
  SecureStore.deleteItemAsync(EMAIL_KEY);

/**
 * Subscribes an address, then records it as this device's identity.
 *
 * The write happens only on success, for the same reason web identifies only
 * after a successful subscribe: a stored address that Klaviyo rejected would
 * attach every future event to a profile that does not exist, and keychain
 * entries survive app updates — so one bad value written once keeps coming
 * back long after the bug is fixed. Same reasoning as `readCartId` in
 * lib/cart-storage.ts.
 */
export const subscribe = async (email: string): Promise<SubscribeResult> => {
  /*
   * A warning, never a rejection.
   *
   * Klaviyo discards addresses it judges fake — anything on example.com or
   * test.com, or containing test/fake/invalid — and returns 202 anyway. We
   * cannot reproduce their filter well enough to block a real shopper over it,
   * so this only speaks up in development, where the person reading the log is
   * the one who needs it.
   */
  if (__DEV__ && looksFakeToKlaviyo(email)) {
    console.warn(
      `[klaviyo] "${email}" looks like test data. Klaviyo silently discards ` +
        `addresses containing test/fake/invalid or on example.com and test.com, ` +
        `and still returns 202. Use a plausible address, or nothing will appear ` +
        `in the dashboard. See docs/integration-klaviyo.md.`,
    );
  }

  const result = await submitSubscription({
    publicKey: KLAVIYO_PUBLIC_KEY,
    listId: KLAVIYO_LIST_ID,
    email,
    source: "Formulate mobile",
  });

  /*
   * Klaviyo's own words, in the log. The shopper gets something human; whoever
   * is configuring this needs the actual cause, and this is the one endpoint in
   * the integration that reports one — a wrong list id says exactly that:
   * {"errors":[{"detail":"List not found"}]}.
   */
  if (!result.ok && result.reason === "rejected") {
    console.error(`[klaviyo] subscription rejected (${result.status}):`, result.detail);
  }

  if (result.ok) await SecureStore.setItemAsync(EMAIL_KEY, email.trim());
  return result;
};
