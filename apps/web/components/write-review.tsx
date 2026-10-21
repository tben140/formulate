"use client";

import { useActionState } from "react";

import { submitReview, type ReviewFormState } from "@/app/actions/reviews";

const IDLE: ReviewFormState = { status: "idle" };

/**
 * A plain "Write a review" form for Judge.me (via the Worker): rating, name,
 * email, title and review. Native controls and a real form, so it works
 * before JavaScript and with any assistive technology. Collapsed until asked
 * for, so it doesn't push the reviews down.
 */
export const WriteReview = ({
  productId,
  productTitle,
}: {
  readonly productId: string;
  readonly productTitle: string;
}) => {
  const [state, action, pending] = useActionState(submitReview, IDLE);

  if (state.status === "sent") {
    return (
      <p role="status" className="mt-4 text-sm text-success">
        Thanks: your review has been sent. It appears here once it's been checked.
      </p>
    );
  }

  return (
    <details className="mt-6 rounded-md border border-border px-4 py-3">
      <summary className="cursor-pointer text-sm font-semibold">Write a review</summary>
      <form action={action} className="mt-4 space-y-4 text-sm">
        <input type="hidden" name="productId" value={productId} />

        <fieldset>
          <legend className="mb-2 font-medium">Your rating of {productTitle}</legend>
          <div className="flex flex-wrap gap-3">
            {[5, 4, 3, 2, 1].map((stars) => (
              <label key={stars} className="flex items-center gap-1">
                <input type="radio" name="rating" value={stars} required />
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
          <label htmlFor="review-email" className="mb-1 block font-medium">
            Email
          </label>
          <input
            id="review-email"
            name="email"
            type="email"
            required
            maxLength={254}
            autoComplete="email"
            aria-describedby="review-email-hint"
            className="w-full rounded-md border border-border px-3 py-2"
          />
          <p id="review-email-hint" className="mt-1 text-xs text-foreground-muted">
            Never shown. Judge.me, our reviews provider, uses it to confirm the review.
          </p>
        </div>

        <div>
          <label htmlFor="review-title" className="mb-1 block font-medium">
            Title (optional)
          </label>
          <input
            id="review-title"
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
            name="body"
            required
            maxLength={2000}
            rows={5}
            className="w-full rounded-md border border-border px-3 py-2"
          />
        </div>

        <p role="status" aria-live="polite" className="text-danger">
          {state.status === "error" ? state.message : ""}
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
