import { expect, test } from "@playwright/test";

import { openApp } from "./helpers";

/**
 * The footer's email sign-up responds on every screen that has it (SHO-120).
 *
 * SHO-120 found the footer drawn but deaf to touches on the iOS simulator.
 * These tests pass on web, which delivers taps that iOS wouldn't (a view
 * outside its parent's bounds is still hit-tested in a browser), so they
 * guard against regressions in the form itself, not against that bug: the
 * device check on SHO-120 is still needed.
 *
 * Only validation is exercised. It runs before any request, so nothing here
 * subscribes an address or needs the API worker.
 */

for (const [screen, path] of [
  ["home", "/"],
  ["a collection", "/collections/performance"],
  ["a product", "/products/daily-multivitamin"],
] as const) {
  test(`the footer's sign-up responds on ${screen}`, async ({ page }) => {
    await openApp(page, path);
    const field = page.getByRole("textbox", {
      name: "Email address for restock and subscription news",
    });
    const signUp = page.getByRole("button", { name: "Sign up" });

    await signUp.scrollIntoViewIfNeeded();
    await signUp.tap();
    await expect(page.getByText("Enter your email address.")).toBeVisible();

    await field.tap();
    await expect(field).toBeFocused();
    await field.fill("not-an-email");
    await signUp.tap();
    await expect(
      page.getByText("That doesn't look like an email address. Check it and try again."),
    ).toBeVisible();
  });
}
