"use client";

import Script from "next/script";
import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { forgetCartAnalytics } from "@/app/actions/cart";
import { writeConsent, type TrackingConsent } from "@/lib/consent";
import {
  analytics,
  forgetProductAnalytics,
  notifyAnalyticsConsentChanged,
  POSTHOG_KEY,
} from "@/lib/product-analytics";
import {
  discardQueuedEvents,
  KLAVIYO_PUBLIC_KEY,
  KLAVIYO_SCRIPT_URL,
} from "@/lib/klaviyo";

/**
 * Tracking consent: the banner, the preferences control, and the one place
 * `klaviyo.js` is loaded.
 *
 * ⚠️ **Loading the script is the gate.** Not a flag inside it, not a filter on
 * events: until the shopper accepts, `klaviyo.js` is not in the page, so there
 * is no `__kla_id` cookie and nothing that could transmit. The theme gets the
 * same guarantee from Klaviyo's app embed deferring to Shopify's Customer
 * Privacy API; a headless surface has to build it. See ADR 0008 for why this is
 * our own banner rather than Shopify's API.
 *
 * The initial state comes from the server, which read the cookie. So a shopper
 * who has already decided never sees the banner flash, and a shopper who
 * declined never receives a page that references the script.
 */

interface ConsentContextValue {
  readonly reopen: () => void;
}

const ConsentContext = createContext<ConsentContextValue | null>(null);

/**
 * Deletes what `klaviyo.js` left behind.
 *
 * Run on every refusal. Declining the very first time leaves nothing to
 * delete, because the script never ran, but a shopper asked again after the
 * consent cookie expired may still have Klaviyo's cookies from before.
 */
const forgetKlaviyo = (): void => {
  const expired = "Max-Age=0; Path=/";
  const host = window.location.hostname;

  /*
   * A cookie can only be removed with the domain it was set with, and the
   * script may have used any parent of this host: on www.example.com it sets
   * `__kla_id` on .example.com. So every suffix down to two labels is tried.
   * (`Domain=x` and `Domain=.x` are the same thing, so one each.) A browser
   * ignores a Domain that is a public suffix, such as vercel.app, so trying
   * one is harmless.
   */
  const labels = host.split(".");
  const domains =
    labels.length < 2 ? [] : labels.slice(0, -1).map((_, i) => labels.slice(i).join("."));

  for (const pair of document.cookie.split("; ")) {
    const name = pair.split("=")[0] ?? "";
    if (!name.startsWith("__kla")) continue;
    document.cookie = `${name}=; ${expired}`;
    for (const domain of domains)
      document.cookie = `${name}=; ${expired}; Domain=${domain}`;
  }

  /*
   * Observed after accepting, not guessed: `klaviyoOnsite`,
   * `kl-post-identification-sync`, `$referrer` and `$last_referrer` in local
   * storage, `klaviyoPagesVisitCountV2` in session storage. The `$` keys carry
   * no Klaviyo prefix, so they are named rather than matched.
   */
  const isKlaviyoKey = (key: string): boolean =>
    key.startsWith("klaviyo") ||
    key.startsWith("kl-") ||
    key.startsWith("__kla") ||
    key === "$referrer" ||
    key === "$last_referrer";

  try {
    for (const storage of [window.localStorage, window.sessionStorage]) {
      for (const key of Object.keys(storage)) {
        if (isKlaviyoKey(key)) storage.removeItem(key);
      }
    }
  } catch (error) {
    // SecurityError: storage is blocked, so nothing was written there either.
    if (!(error instanceof DOMException)) throw error;
  }
};

/** Session-scoped: a withdrawal's cart clean-up, carried across its reload. */
const CART_CLEANUP_KEY = "formulate_cart_cleanup";

const leaveCartCleanup = () => {
  try {
    window.sessionStorage.setItem(CART_CLEANUP_KEY, "1");
  } catch {
    // Storage blocked: the next add takes the id off instead.
  }
};

const isCartCleanupDue = (): boolean => {
  try {
    return window.sessionStorage.getItem(CART_CLEANUP_KEY) !== null;
  } catch {
    return false;
  }
};

const clearCartCleanup = () => {
  try {
    window.sessionStorage.removeItem(CART_CLEANUP_KEY);
  } catch {
    // Storage blocked: nothing was left there.
  }
};

/**
 * Tells the shopper's other open tabs about a refusal. A tab that loaded
 * `klaviyo.js` under the old choice keeps running it, and only a reload stops
 * it, so the refusal has to reach every tab, not just the one it was made in.
 * Same-origin only; a browser without it leaves other tabs as they were.
 */
const CONSENT_CHANNEL = "formulate_consent";

const announceRefusal = () => {
  try {
    const channel = new BroadcastChannel(CONSENT_CHANNEL);
    channel.postMessage("denied");
    channel.close();
  } catch {
    // No BroadcastChannel: other tabs pick the cookie up on their next load.
  }
};

export const TrackingConsentProvider = ({
  initialConsent,
  children,
}: {
  readonly initialConsent: TrackingConsent;
  readonly children: ReactNode;
}) => {
  const [consent, setConsent] = useState(initialConsent);
  const [reopened, setReopened] = useState(false);

  // One choice at a time: a Decline still clearing the cart mustn't finish
  // after a later Accept and leave the state saying the opposite of the cookie.
  const pending = useRef(false);

  // A withdrawal reloads at once (below), which would cancel the cart
  // clean-up, so it's left for the reloaded page to do. The marker stays
  // until the clean-up succeeds, so a failure is retried on the next page.
  useEffect(() => {
    if (!isCartCleanupDue()) return;
    forgetCartAnalytics()
      .then((done) => {
        if (done) clearCartCleanup();
      })
      .catch(() => undefined);
  }, []);

  // A refusal made in another tab. The cookie already says so; this tab's
  // state and scripts don't yet. With the scripts running, clear their
  // storage again (they may have rewritten it) and reload without them.
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel(CONSENT_CHANNEL);
    channel.onmessage = (event: MessageEvent) => {
      if (event.data !== "denied") return;
      discardQueuedEvents();
      if (consent === "granted") {
        forgetKlaviyo();
        forgetProductAnalytics();
        window.location.reload();
        return;
      }
      setConsent("denied");
      setReopened(false);
    };
    return () => channel.close();
  }, [consent]);

  const choose = async (next: Exclude<TrackingConsent, "unset">) => {
    if (pending.current) return;
    pending.current = true;
    try {
      writeConsent(next);
      // The add-to-cart forms' id field reads consent; tell it.
      notifyAnalyticsConsentChanged();

      if (next === "denied") {
        discardQueuedEvents();
        /*
         * On every refusal, not only a withdrawal: the consent cookie expires
         * after six months while localStorage and Klaviyo's cookies don't, so
         * a shopper asked again ("unset") may still have an old id here.
         */
        forgetKlaviyo();
        forgetProductAnalytics();
        announceRefusal();

        /*
         * Withdrawing after accepting. `klaviyo.js` is already running and
         * there is no API to stop it, so reload into a page the server renders
         * without it, straight away. Heavy-handed, but it is the only way the
         * refusal is actually true for the rest of the visit. The cart's
         * analytics id comes off on the reloaded page.
         */
        if (consent === "granted") {
          leaveCartCleanup();
          window.location.reload();
          return;
        }

        // No script to stop: take the cart's analytics id off now, so it
        // doesn't reach the order. Two seconds at most.
        await Promise.race([
          forgetCartAnalytics().catch(() => undefined),
          new Promise((resolve) => setTimeout(resolve, 2000)),
        ]);
      }

      setConsent(next);
      setReopened(false);

      // Events before Accept were dropped, not queued (lib/product-analytics.ts),
      // so the page the shopper accepted on is counted from here.
      if (next === "granted") analytics()?.pageview();
    } finally {
      pending.current = false;
    }
  };

  const showBanner =
    Boolean(KLAVIYO_PUBLIC_KEY || POSTHOG_KEY) && (consent === "unset" || reopened);

  return (
    <ConsentContext.Provider value={{ reopen: () => setReopened(true) }}>
      {children}

      {showBanner ? (
        <ConsentBanner
          onAccept={() => void choose("granted")}
          onDecline={() => void choose("denied")}
        />
      ) : null}

      {/*
        `afterInteractive` rather than `beforeInteractive`: tracking must not
        block first paint, and lib/klaviyo.ts queues events that fire before
        the script arrives. Mounting it later, on Accept, drains that queue.

        Omitted entirely when the key is unset, so local dev and CI without
        Klaviyo credentials render a clean page.
      */}
      {KLAVIYO_PUBLIC_KEY && consent === "granted" ? (
        <Script src={KLAVIYO_SCRIPT_URL} strategy="afterInteractive" />
      ) : null}
    </ConsentContext.Provider>
  );
};

/**
 * Not a modal, and deliberately so.
 *
 * A consent wall that blocks the page until answered pressures the answer, and
 * the ICO's guidance treats that as invalid consent. The shop stays usable with
 * the banner open; nothing is tracked while it is.
 *
 * Accept and Decline are the same size, the same style and one click each.
 * Making refusal harder than acceptance is the other thing that invalidates it.
 *
 * `sticky`, not `fixed`: it is the last child of the body's flex column, so it
 * pins to the viewport while there is page below it and settles after the
 * footer at the end. `fixed` would permanently cover the bottom of the footer.
 */
const ConsentBanner = ({
  onAccept,
  onDecline,
}: {
  readonly onAccept: () => void;
  readonly onDecline: () => void;
}) => {
  const headingId = useId();

  const button =
    "rounded-md border border-border bg-surface px-4 py-2 text-sm font-semibold text-foreground hover:bg-surface-muted";

  return (
    <section
      aria-labelledby={headingId}
      className="sticky bottom-0 z-40 border-t border-border bg-surface"
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm">
          <h2 id={headingId} className="font-semibold text-foreground">
            Cookies
          </h2>
          <p className="mt-1 text-foreground-muted">
            With your permission, Klaviyo remembers what you browse and add to your basket
            so we can email you reminders, and PostHog measures how the shop is used so we
            can improve it. Nothing is tracked unless you accept. You can change your mind
            from the footer at any time.
          </p>
        </div>

        <div className="flex shrink-0 gap-2">
          <button type="button" onClick={onDecline} className={button}>
            Decline
          </button>
          <button type="button" onClick={onAccept} className={button}>
            Accept
          </button>
        </div>
      </div>
    </section>
  );
};

/**
 * Withdrawing consent has to be as easy as giving it, so the choice stays one
 * click away for the whole visit rather than disappearing with the banner.
 */
export const CookiePreferencesButton = () => {
  const context = useContext(ConsentContext);
  // The same condition as the banner: withdrawal must be reachable whenever
  // there was anything to accept (ADR 0008).
  if (!context || !(KLAVIYO_PUBLIC_KEY || POSTHOG_KEY)) return null;

  return (
    <button
      type="button"
      onClick={context.reopen}
      className="text-sm text-foreground-muted underline-offset-4 hover:text-foreground hover:underline"
    >
      Cookie preferences
    </button>
  );
};
