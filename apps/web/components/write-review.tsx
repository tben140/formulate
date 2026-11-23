"use client";

import { Link } from "@/components/link";
import { useActionState, useEffect, useRef, useState } from "react";

import {
  submitReview,
  type ReviewFormState,
  type ReviewValues,
} from "@/app/actions/reviews";

const IDLE: ReviewFormState = { status: "idle" };

/**
 * What was typed, kept across the round trip to Shopify's sign-in page, which
 * reloads this page. Session storage: this tab only, gone when it closes.
 */
const draftKey = (productId: string) => `dh-review-draft:${productId}`;

const saveDraft = (productId: string, form: HTMLFormElement | null) => {
  if (!form) return;
  const data = new FormData(form);
  const draft: ReviewValues = {
    rating: String(data.get("rating") ?? ""),
    name: String(data.get("name") ?? ""),
    title: String(data.get("title") ?? ""),
    body: String(data.get("body") ?? ""),
  };
  try {
    sessionStorage.setItem(draftKey(productId), JSON.stringify(draft));
  } catch {
    // Storage blocked: the draft is lost, as it would be without this.
  }
};

const takeDraft = (productId: string): ReviewValues | undefined => {
  try {
    const stored = sessionStorage.getItem(draftKey(productId));
    sessionStorage.removeItem(draftKey(productId));
    const draft: unknown = stored ? JSON.parse(stored) : undefined;
    if (!draft || typeof draft !== "object") return undefined;
    const field = (name: string) => {
      const value = (draft as Record<string, unknown>)[name];
      return typeof value === "string" ? value : "";
    };
    return {
      rating: field("rating"),
      name: field("name"),
      title: field("title"),
      body: field("body"),
    };
  } catch {
    return undefined;
  }
};

/**
 * A plain "Write a review" form for Judge.me (via the Worker): rating, name,
 * title and review. Only signed-in customers who bought the product can send
 * one (app/actions/reviews.ts); the form says so up front. Native controls and a real form, so it works
 * before JavaScript and with any assistive technology. Collapsed until asked
 * for, so it doesn't push the reviews down.
 */
export const WriteReview = ({
  productId,
  productTitle,
  path,
}: {
  readonly productId: string;
  readonly productTitle: string;
  /** This page, to come back to after signing in. */
  readonly path: string;
}) => {
  const [state, action, pending] = useActionState(submitReview, IDLE);
  const form = useRef<HTMLFormElement>(null);
  // Back from signing in: what was typed before.
  const [draft, setDraft] = useState<ReviewValues>();
  useEffect(() => {
    // After mount, as session storage isn't there to render on the server.
    // Only a draft found is set: taking it empties storage, so a second run
    // (Strict Mode, in development) mustn't overwrite it with nothing.
    const found = takeDraft(productId);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (found) setDraft(found);
  }, [productId]);
  // After a failed send, what was typed comes back (React resets the form).
  const values = state.status === "error" ? state.values : draft;

  if (state.status === "sent") {
    return (
      <p role="status" className="mt-4 text-sm text-success">
        Thanks: your review has been sent. It appears here once it's been checked.
      </p>
    );
  }

  return (
    <details
      className="mt-6 rounded-md border border-border px-4 py-3"
      // Open again after a failed send, showing the error.
      open={state.status === "error" || draft !== undefined || undefined}
    >
      <summary className="cursor-pointer text-sm font-semibold">Write a review</summary>
      <form
        ref={form}
        // Remounted when a draft arrives, so the fields take its values.
        key={draft ? "draft" : "blank"}
        action={action}
        // Not natively disabled, so focus isn't dropped; refused here instead.
        onSubmit={(event) => {
          if (pending) event.preventDefault();
        }}
        className="mt-4 space-y-4 text-sm"
      >
        <input type="hidden" name="productId" value={productId} />
        <input type="hidden" name="returnTo" value={path} />

        <p className="text-foreground-muted">
          Reviews are from verified buyers: sign in with the account you ordered with.
        </p>

        <fieldset>
          <legend className="mb-2 font-medium">Your rating of {productTitle}</legend>
          <div className="flex flex-wrap gap-3">
            {[5, 4, 3, 2, 1].map((stars) => (
              <label key={stars} className="flex items-center gap-1">
                <input
                  type="radio"
                  name="rating"
                  value={stars}
                  required
                  defaultChecked={values?.rating === String(stars)}
                />
                {stars} {stars === 1 ? "star" : "stars"}
              </label>
            ))}
          </div>
        </fieldset>

        <div>
          <label htmlFor="review-name" className="mb-1 block font-medium">
            Name
          </label>
          <input
            id="review-name"
            defaultValue={values?.name}
            name="name"
            required
            maxLength={80}
            autoComplete="name"
            aria-describedby="review-name-hint"
            className="w-full rounded-md border border-border px-3 py-2"
          />
          <p id="review-name-hint" className="mt-1 text-xs text-foreground-muted">
            Shown as your first name and initial.
          </p>
        </div>

        <div>
          <label htmlFor="review-title" className="mb-1 block font-medium">
            Title (optional)
          </label>
          <input
            id="review-title"
            defaultValue={values?.title}
            name="title"
            maxLength={120}
            className="w-full rounded-md border border-border px-3 py-2"
          />
        </div>

        <div>
          <label htmlFor="review-body" className="mb-1 block font-medium">
            Review
          </label>
          <textarea
            id="review-body"
            defaultValue={values?.body}
            name="body"
            required
            maxLength={2000}
            rows={5}
            className="w-full rounded-md border border-border px-3 py-2"
          />
        </div>

        <p role="status" aria-live="polite" className="text-danger">
          {state.status === "error" ? state.message : ""}
          {state.status === "error" && state.signIn ? (
            <>
              {" "}
              <Link
                href={state.signIn}
                onClick={() => saveDraft(productId, form.current)}
                className="underline underline-offset-4"
              >
                Sign in
              </Link>
            </>
          ) : null}
        </p>

        <button
          type="submit"
          aria-disabled={pending || undefined}
          className="rounded-md bg-brand-600 px-4 py-2 font-semibold text-surface hover:bg-brand-700 aria-disabled:cursor-wait"
        >
          {pending ? "Sending…" : "Send review"}
        </button>
      </form>
    </details>
  );
};
