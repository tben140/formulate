import { AxeBuilder } from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/**
 * Search suggestions as you type (SHO-103), against the real store's catalogue.
 * "magn" only matches Magnesium Glycinate's family of words, so the first
 * suggestion is stable while the catalogue is.
 */
test("suggestions appear as you type, and the keyboard picks one", async ({ page }) => {
  await page.goto("/search", { waitUntil: "networkidle" });
  const box = page.getByRole("combobox", { name: "Search products" });

  await box.fill("m");
  // One letter is below the shared minimum: no request, no list.
  await expect(page.getByRole("listbox")).toBeHidden();

  await box.fill("magn");
  const list = page.getByRole("listbox", { name: "Suggested products" });
  await expect(list).toBeVisible();
  await expect(list.getByRole("option").first()).toContainText("Magnesium Glycinate");
  await expect(
    page.getByRole("status").filter({ hasText: /suggestions?\./ }),
  ).toBeAttached();

  const axe = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(axe.violations.map((v) => v.id)).toEqual([]);

  await box.press("ArrowDown");
  const first = list.getByRole("option").first();
  await expect(first).toHaveAttribute("aria-selected", "true");
  await expect(box).toHaveAttribute(
    "aria-activedescendant",
    (await first.getAttribute("id"))!,
  );

  await box.press("Enter");
  await page.waitForURL(/\/products\/magnesium-glycinate/);
});

test("Escape closes the list, and Enter still runs a full search", async ({ page }) => {
  await page.goto("/search", { waitUntil: "networkidle" });
  const box = page.getByRole("combobox", { name: "Search products" });
  await box.fill("magn");
  await expect(page.getByRole("listbox")).toBeVisible();

  await box.press("Escape");
  await expect(page.getByRole("listbox")).toBeHidden();
  await expect(box).toHaveValue("magn");

  await box.press("Enter");
  await page.waitForURL(/\/search\?q=magn/);
  // The results page doesn't suggest its own term back.
  await expect(page.getByRole("listbox")).toBeHidden();
});
