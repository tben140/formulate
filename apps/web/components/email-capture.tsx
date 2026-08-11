"use client";

import type { SubscribeResult } from "@formulate/analytics";
import { useId, useState, useTransition } from "react";

import { subscribe } from "@/lib/klaviyo";

/**
 * Turns a failure into something a shopper can act on.
 *
 * `not-configured` deliberately does not mention their address. An
 * unconfigured deployment telling visitors their email is invalid sends them
 * off to fix the one thing that is not broken.
 */
const errorMessage = (result: Extract<SubscribeResult, { ok: false }>): string => {
  switch (result.reason) {
    case "invalid-email":
      return "That doesn't look like an email address. Check it and try again.";
    case "empty":
      return "Enter your email address.";
    /*
     * Unreachable here — this surface calls Klaviyo directly, and only the
     * mobile consent proxy rate limits. Handled anyway because the shared
     * union covers all three surfaces, and an exhaustive switch is what makes
     * adding a reason to that union a compile error rather than a silent gap.
     * Which is exactly how this case came to be written.
     */
    case "rate-limited":
      return "Too many attempts. Please wait a minute and try again.";
    case "not-configured":
      return "Sign-up isn't available at the moment.";
    case "network":
      return "We couldn't reach our email service. Check your connection and try again.";
    case "rejected":
      return "Something went wrong at our end. Please try again.";
  }
};

type Status = { readonly kind: "idle" } | { readonly kind: "done"; readonly message: string };

/**
 * Newsletter sign-up — and the identity moment for the whole Klaviyo
 * integration.
 *
 * Until someone submits this, Klaviyo caches every event this site emits and
 * transmits none of them. See `subscribe` in lib/klaviyo.ts.
 *
 * Client component because it posts to Klaviyo from the browser with the
 * public key. That is Klaviyo's intended design for this endpoint, not a
 * shortcut — routing it through a Server Action would add a hop without adding
 * safety, and the second half of the work (`identify`) has to happen in the
 * browser regardless.
 */
export const EmailCapture = () => {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();

  const inputId = useId();
  const messageId = useId();
  const consentId = useId();

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    startTransition(async () => {
      const result = await subscribe(email);

      if (result.ok) {
        /*
         * "You're on the list", not "Thanks for subscribing".
         *
         * Klaviyo returns 202 for a new profile and for one already on the
         * list, with no way to tell them apart from the client. This wording
         * is true either way; the other is a claim we cannot support.
         */
        setStatus({ kind: "done", message: "You're on the list. Check your inbox." });
        setFailed(false);
        setEmail("");
        return;
      }

      setStatus({ kind: "done", message: errorMessage(result) });
      setFailed(true);
    });
  };

  return (
    /*
      `noValidate` turns off native constraint validation deliberately. It
      fires before this handler, so `required` and `type="email"` would
      pre-empt our own checks — and it reports through a browser bubble that
      screen readers announce inconsistently and CSS cannot touch. The
      attributes stay for their other jobs (the @ key, autofill, semantics);
      only the reporting is ours.
    */
    <form onSubmit={onSubmit} noValidate className="w-full max-w-sm">
      <label htmlFor={inputId} className="block text-sm font-semibold text-foreground">
        Get restock and subscription news
      </label>

      <div className="mt-2 flex gap-2">
        <input
          id={inputId}
          // `email` gives mobile keyboards the @ key; `autocomplete` lets a
          // password manager fill it. Both are one attribute and both are the
          // difference between a form people complete and one they abandon.
          type="email"
          name="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            // Clear a stale error as soon as they start correcting it,
            // otherwise the message contradicts what is now in the field.
            if (status.kind === "done") setStatus({ kind: "idle" });
            setFailed(false);
          }}
          // ⚠️ Not the conventional `you@example.com`. Klaviyo silently
          // discards example.com addresses, so that placeholder would prompt
          // whoever tests this to type the one thing guaranteed not to work.
          placeholder="you@company.com"
          // The message carries the error, so it must describe the input for a
          // screen reader to reach it from the field. The consent line is
          // included because it is a condition of submitting, not decoration.
          aria-describedby={`${consentId} ${messageId}`}
          aria-invalid={failed}
          disabled={pending}
          className="min-w-0 flex-1 rounded-md border border-border px-3 py-2 text-sm text-foreground placeholder:text-foreground-muted focus:border-brand-600 focus:outline-2 focus:outline-offset-2 focus:outline-brand-600 disabled:bg-ink-100"
        />

        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-surface hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-ink-300"
        >
          {pending ? "Signing up…" : "Sign up"}
        </button>
      </div>

      {/*
        An explicit statement of what is being consented to. Recording
        SUBSCRIBED against someone who was never told is the real GDPR problem
        — the cookie banner is the lesser one.
      */}
      <p id={consentId} className="mt-2 text-xs text-foreground-muted">
        Marketing emails about restocks and subscription offers. Unsubscribe any time.
      </p>

      {/*
        One element serves as both the live region and the input's description,
        so the message is announced when it appears and reachable from the
        field afterwards. `polite` — a newsletter form is never urgent enough
        to interrupt what someone is reading.
      */}
      <p
        id={messageId}
        role="status"
        aria-live="polite"
        className={`mt-2 min-h-5 text-sm ${failed ? "text-danger" : "text-success"}`}
      >
        {status.kind === "done" ? status.message : ""}
      </p>
    </form>
  );
};
