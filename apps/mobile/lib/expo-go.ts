import Constants, { ExecutionEnvironment } from "expo-constants";

/**
 * Whether the app is running inside the Expo Go app from the App Store.
 *
 * Expo Go ships a fixed set of native modules, and two of ours are not in it:
 * `@shopify/checkout-sheet-kit` and `klaviyo-react-native-sdk`. Everything
 * else in the app runs there unchanged, which makes Expo Go the quickest way to
 * put a build on a real phone — no Apple Developer account, no native build.
 *
 * So the two modules are loaded only outside Expo Go (see `lib/checkout.tsx`
 * and `lib/klaviyo.ts`), and inside it they fall back:
 *
 *   checkout  opens Shopify's web checkout in the browser instead of the sheet
 *   Klaviyo   identity and events are skipped; consent still works, because it
 *             goes through `apps/api` rather than the SDK
 *
 * Development builds and store builds are `bare` or `standalone`, never
 * `storeClient`, so nothing changes for them.
 */
export const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
