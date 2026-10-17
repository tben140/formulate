"use client";

import type { SubscribeResult } from "@formulate/analytics";
import { useId, useState, useTransition } from "react";

import { notifyWhenBackInStock } from "@/lib/klaviyo";

/** Same copy as the newsletter form's, so a failure reads the same anywhere. */
const errorMessage = (result: Extract<SubscribeResult, { ok: false }>): string => {
  switch (result.reason) {
    case "invalid-email":
      return "That doesn't look like an email address. Check it and try again.";
    case "empty":
      return "Enter your email address.";
    case "rate-limited":
      return "Too many attempts. Please wait a minute and try again.";
    case "not-configured":
      return "Restock alerts aren't available at the moment.";
    case "network":
      return "We couldn't reach our email service. Check your connection and try again.";
    case "rejected":
      return "Something went wrong at our end. Please try again.";
  }
};

type Status =
  { readonly kind: "idle" } | { readonly kind: "done"; readonly message: string };

/**
 * "Email me when it's back", shown in place of buying when the selected
 * variant is sold out (SHO-118). Klaviyo's live "Back in stock" flow sends the
 * email when Shopify restocks the variant.
 *
 * ⚠️ Worded as a one-off alert, not a subscription, because that's what it
 * is: no list, no marketing consent. Implying otherwise would make the
 * newsletter's consent line meaningless.
 *
 * Its own form, after the add-to-cart one: forms can't nest. The caller keys
 * it by variant, so choosing another variant starts it afresh.
 */
export const BackInStockForm = ({
  variantId,
  itemName,
}: {
  readonly variantId: string;
  /** "Magnesium Glycinate, 200 mg": what the email will be about. */
  readonly itemName: string;
}) => {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();

  const inputId = useId();
  const hintId = useId();
  const messageId = useId();

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    startTransition(async () => {
      const result = await notifyWhenBackInStock(email, variantId);
      if (result.ok) {
        // Klaviyo can't say whether this address was already waiting, so this
        // claims only what's true either way.
        setStatus({ kind: "done", message: "We'll email you when it's back." });
        setFailed(false);
        setEmail("");
        return;
      }
      setStatus({ kind: "done", message: errorMessage(result) });
      setFailed(true);
    });
  };

  return (
    // noValidate: the messages below are ours, as in the newsletter form.
    <form
      onSubmit={onSubmit}
      noValidate
      className="mt-4 rounded-md border border-border p-4"
    >
      <label htmlFor={inputId} className="block text-sm font-semibold text-foreground">
        Email me when it&apos;s back
      </label>
      <p id={hintId} className="mt-1 text-xs text-foreground-muted">
        {/* One string: the build dropped the space after a {itemName} expression. */}
        {`One email when ${itemName} is back in stock. This doesn't sign you up for marketing.`}
      </p>

      <div className="mt-3 flex gap-2">
        <input
          id={inputId}
          type="email"
          name="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            if (status.kind === "done") setStatus({ kind: "idle" });
            setFailed(false);
          }}
          placeholder="you@company.com"
          aria-describedby={`${hintId} ${messageId}`}
          aria-invalid={failed}
          disabled={pending}
          className="min-w-0 flex-1 rounded-md border border-border px-3 py-2 text-sm text-foreground placeholder:text-foreground-muted focus:border-brand-600 focus:outline-2 focus:outline-offset-2 focus:outline-brand-600 disabled:bg-ink-100"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-surface hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-ink-300"
        >
          {pending ? "Sending…" : "Notify me"}
        </button>
      </div>

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
