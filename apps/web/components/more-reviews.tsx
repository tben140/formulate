"use client";

import type { PublicReview } from "@formulate/shopify";
import { useState } from "react";

import { ReviewItem } from "./review-item";

/** "Show more reviews": the next pages, appended to the list. */
export const MoreReviews = ({ handle }: { readonly handle: string }) => {
  const [reviews, setReviews] = useState<readonly PublicReview[]>([]);
  const [next, setNext] = useState<number | null>(2);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");

  const load = async () => {
    if (next === null) return;
    setState("loading");
    try {
      const response = await fetch(
        `/products/${encodeURIComponent(handle)}/reviews?page=${next}`,
      );
      const body = (await response.json()) as
        { ok: true; reviews: PublicReview[]; hasMore: boolean } | { ok: false };
      if (!body.ok) throw new Error("reviews");
      setReviews((current) => [...current, ...body.reviews]);
      setNext(body.hasMore ? next + 1 : null);
      setState("idle");
    } catch {
      setState("error");
    }
  };

  return (
    <>
      {reviews.length > 0 ? (
        <ul className="divide-y divide-border border-b border-border">
          {reviews.map((review) => (
            <ReviewItem key={review.id} review={review} />
          ))}
        </ul>
      ) : null}
      {next !== null ? (
        <div className="mt-4">
          <button
            type="button"
            onClick={() => void load()}
            aria-disabled={state === "loading"}
            className="rounded-md border border-border px-4 py-2 text-sm font-semibold hover:bg-surface-muted"
          >
            {state === "loading" ? "Loading…" : "Show more reviews"}
          </button>
          {state === "error" ? (
            <p role="alert" className="mt-2 text-sm text-danger">
              More reviews couldn&apos;t be loaded. Please try again.
            </p>
          ) : null}
        </div>
      ) : null}
    </>
  );
};
