import { fn } from "storybook/test";

/**
 * lib/klaviyo for Storybook. Hand-written rather than automocked: an automock
 * still loads the real module, and that pulls in Expo's native layer, which
 * doesn't exist in a browser. Stories set results with mocked(subscribe).
 */
export const KLAVIYO_PUBLIC_KEY = "";
export const initKlaviyo = fn();
export const readIdentifiedEmail = fn(async () => null);
export const identify = fn();
export const subscribe = fn(async () => ({ ok: true as const }));
