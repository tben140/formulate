import { describe, expect, it } from "vitest";

import {
  formatReviewDate,
  ratingLabel,
  reviewSummary,
  reviewerDisplayName,
  starFills,
} from "./reviews";

const rating = (value: string, scaleMax = "5.0") => ({
  value: JSON.stringify({ value, scale_min: "1.0", scale_max: scaleMax }),
});

describe("reviewSummary", () => {
  it("reads Shopify's standard rating metafields", () => {
    expect(
      reviewSummary({ rating: rating("4.5"), ratingCount: { value: "12" } }),
    ).toEqual({
      average: 4.5,
      count: 12,
    });
  });

  it("normalises a rating written on another scale to five stars", () => {
    expect(
      reviewSummary({ rating: rating("8", "10"), ratingCount: { value: "3" } })?.average,
    ).toBe(4);
  });

  it("is null without reviews, or with fields it can't read", () => {
    expect(reviewSummary({ rating: null, ratingCount: null })).toBeNull();
    expect(
      reviewSummary({ rating: rating("4.5"), ratingCount: { value: "0" } }),
    ).toBeNull();
    expect(
      reviewSummary({ rating: { value: "not json" }, ratingCount: { value: "2" } }),
    ).toBeNull();
  });
});

describe("labels", () => {
  it("says the rating in words, singular and plural", () => {
    expect(ratingLabel({ average: 4.5, count: 12 })).toBe(
      "4.5 out of 5 stars from 12 reviews",
    );
    expect(ratingLabel({ average: 5, count: 1 })).toBe("5 out of 5 stars from 1 review");
  });

  it("fills stars partially", () => {
    expect(starFills(3.5)).toEqual([1, 1, 1, 0.5, 0]);
  });

  it("shows a first name and initial, never a full name", () => {
    expect(reviewerDisplayName("Sam Taylor")).toBe("Sam T.");
    expect(reviewerDisplayName("  sam  de  la  cruz ")).toBe("sam C.");
    expect(reviewerDisplayName("Sam")).toBe("Sam");
    expect(reviewerDisplayName("")).toBe("Anonymous");
  });

  it("formats dates in London time", () => {
    expect(formatReviewDate("2026-10-08T23:30:00Z")).toBe("9 October 2026");
    expect(formatReviewDate("nonsense")).toBe("");
  });
});
