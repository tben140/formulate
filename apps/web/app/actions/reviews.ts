"use server";

/**
 * "Write a review": sent through the Worker (apps/api, POST /reviews/new),
 * which holds Judge.me's private token and checks every field again.
 */

/** What was typed, so a failed send doesn't lose it (React resets the form). */
export interface ReviewValues {
  readonly rating: string;
  readonly name: string;
  readonly email: string;
  readonly title: string;
  readonly body: string;
}

export type ReviewFormState =
  | { readonly status: "idle" }
  | { readonly status: "sent" }
  | { readonly status: "error"; readonly message: string; readonly values: ReviewValues };

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
  const values: ReviewValues = {
    rating: String(formData.get("rating") ?? ""),
    name: String(formData.get("name") ?? ""),
    email: String(formData.get("email") ?? ""),
    title: String(formData.get("title") ?? ""),
    body: String(formData.get("body") ?? ""),
  };
  const error = (message: string): ReviewFormState => ({
    status: "error",
    message,
    values,
  });

  const api = process.env.FORMULATE_API_URL ?? "";
  if (!api) return error("Reviews can't be sent right now.");

  try {
    const response = await fetch(`${api}/reviews/new`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        productId: String(formData.get("productId") ?? ""),
        rating: Number(values.rating || 0),
        name: values.name,
        email: values.email,
        title: values.title,
        body: values.body,
      }),
    });
    const result = (await response.json()) as
      { ok: true } | { ok: false; reason: string; field?: string };
    if (result.ok) return { status: "sent" };
    if (result.reason === "invalid" && result.field && FIELD_MESSAGES[result.field]) {
      return error(FIELD_MESSAGES[result.field]!);
    }
    if (result.reason === "rate-limited") {
      return error("Too many tries. Wait a minute and send it again.");
    }
    return error("Your review couldn't be sent. Try again later.");
  } catch {
    return error("Your review couldn't be sent. Try again later.");
  }
};
