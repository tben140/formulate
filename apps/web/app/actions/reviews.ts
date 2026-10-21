"use server";

/**
 * "Write a review": sent through the Worker (apps/api, POST /reviews/new),
 * which holds Judge.me's private token and checks every field again.
 */

export type ReviewFormState =
  | { readonly status: "idle" }
  | { readonly status: "sent" }
  | { readonly status: "error"; readonly message: string };

const FIELD_MESSAGES: Record<string, string> = {
  rating: "Choose a rating from 1 to 5 stars.",
  name: "Add your name (up to 80 characters).",
  email: "Check your email address.",
  title: "Keep the title to 120 characters.",
  body: "Write your review (up to 2,000 characters).",
};

export const submitReview = async (
  _previous: ReviewFormState,
  formData: FormData,
): Promise<ReviewFormState> => {
  const api = process.env.FORMULATE_API_URL ?? "";
  if (!api) return { status: "error", message: "Reviews can't be sent right now." };

  try {
    const response = await fetch(`${api}/reviews/new`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        productId: String(formData.get("productId") ?? ""),
        rating: Number(formData.get("rating") ?? 0),
        name: String(formData.get("name") ?? ""),
        email: String(formData.get("email") ?? ""),
        title: String(formData.get("title") ?? ""),
        body: String(formData.get("body") ?? ""),
      }),
    });
    const result = (await response.json()) as
      { ok: true } | { ok: false; reason: string; field?: string };
    if (result.ok) return { status: "sent" };
    if (result.reason === "invalid" && result.field && FIELD_MESSAGES[result.field]) {
      return { status: "error", message: FIELD_MESSAGES[result.field]! };
    }
    if (result.reason === "rate-limited") {
      return {
        status: "error",
        message: "Too many tries. Wait a minute and send it again.",
      };
    }
    return { status: "error", message: "Your review couldn't be sent. Try again later." };
  } catch {
    return { status: "error", message: "Your review couldn't be sent. Try again later." };
  }
};
