"use client";

import Script from "next/script";
import { createContext, useContext, useId, useState, type ReactNode } from "react";

import { writeConsent, type TrackingConsent } from "@/lib/consent";
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
 * Needed only when consent is withdrawn after being given. Declining first time
 * round leaves nothing to delete, because the script never ran.
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

export const TrackingConsentProvider = ({
  initialConsent,
  children,
}: {
  readonly initialConsent: TrackingConsent;
  readonly children: ReactNode;
}) => {
  const [consent, setConsent] = useState(initialConsent);
  const [reopened, setReopened] = useState(false);

  const choose = (next: Exclude<TrackingConsent, "unset">) => {
    writeConsent(next);

    if (next === "denied") {
      discardQueuedEvents();

      /*
       * Withdrawing after accepting. `klaviyo.js` is already running and there
       * is no API to stop it, so delete what it stored and reload into a page
       * the server renders without it. Heavy-handed, but it is the only way
       * the refusal is actually true for the rest of the visit.
       */
      if (consent === "granted") {
        forgetKlaviyo();
        window.location.reload();
        return;
      }
    }

    setConsent(next);
    setReopened(false);
  };

  const showBanner = Boolean(KLAVIYO_PUBLIC_KEY) && (consent === "unset" || reopened);

  return (
    <ConsentContext.Provider value={{ reopen: () => setReopened(true) }}>
      {children}

      {showBanner ? (
        <ConsentBanner
          onAccept={() => choose("granted")}
          onDecline={() => choose("denied")}
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
            so we can email you reminders. Nothing is tracked unless you accept. You can
            change your mind from the footer at any time.
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
  if (!context || !KLAVIYO_PUBLIC_KEY) return null;

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
