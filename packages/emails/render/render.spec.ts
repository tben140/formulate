import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";

import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const templates = new URL("../templates/", import.meta.url);
const out = new URL("../screenshots/", import.meta.url);
const names = readdirSync(templates).filter((file) => file.endsWith(".html"));

/** What Klaviyo puts in place of its tags, so the page renders as sent. */
const SAMPLE: Readonly<Record<string, string>> = {
  "{% unsubscribe_link %}": "https://www.doublehelixsupplements.co.uk/unsubscribe",
  "{% manage_preferences_link %}": "https://www.doublehelixsupplements.co.uk/preferences",
  "{{ organization.name }}": "Double Helix",
  "{{ organization.full_address }}": "Demo address, United Kingdom",
};
const asSent = (html: string) =>
  Object.entries(SAMPLE).reduce(
    (page, [tag, value]) => page.replaceAll(tag, value),
    html,
  );

/** Gmail on a non-Google account, among others, drops <style>: only inline styles are left. */
const withoutStyles = (html: string) => html.replace(/<style[\s\S]*?<\/style>/g, "");

/**
 * What the Gmail and Outlook apps see: they ignore an email's dark-mode
 * declaration and styles and invert it themselves. Chromium only inverts a
 * page that hasn't declared dark support, so the declaration goes.
 */
const undeclared = (html: string) =>
  html
    .replace(/<meta name="(supported-)?color-scheme"[^>]*>/g, "")
    .replace(/color-scheme:[^;]*;|supported-color-schemes:[^;]*;/g, "")
    .replace(/prefers-color-scheme:\s*dark/g, "prefers-color-scheme: never");

/** A phone, and a desktop client's reading pane. */
const WIDTHS = [375, 800] as const;

for (const name of names) {
  const html = asSent(readFileSync(new URL(name, templates), "utf8"));
  const base = name.replace(/\.html$/, "");

  for (const width of WIDTHS) {
    test(`${base} at ${width}px`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 });
      const variants = [
        ["", info.project.name === "forced-dark" ? undeclared(html) : html],
      ] as [string, string][];
      if (info.project.name === "light")
        variants.push(["-no-style", withoutStyles(html)]);

      for (const [suffix, content] of variants) {
        await page.setContent(content, { waitUntil: "load" });
        // Nothing may push the page sideways on a phone.
        const overflow = await page.evaluate(
          () =>
            document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow, `horizontal scroll${suffix}`).toBeLessThanOrEqual(0);

        mkdirSync(new URL(`${base}/`, out), { recursive: true });
        await page.screenshot({
          path: new URL(`${base}/${info.project.name}${suffix}-${width}.png`, out)
            .pathname,
          fullPage: true,
        });
      }

      // Contrast and the rest of WCAG AA, in the palette this mode shows.
      // Forced dark is the browser's repaint, which axe can't see, so it's
      // checked by eye from the screenshots.
      if (info.project.name !== "forced-dark") {
        await page.setContent(html, { waitUntil: "load" });
        const { violations } = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
          .analyze();
        expect(
          violations.map(
            (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`,
          ),
        ).toEqual([]);
      }
    });
  }
}

test.afterAll(() => {
  // A contact sheet of every screenshot, to compare modes side by side.
  const modes = ["light", "light-no-style", "dark", "forced-dark"];
  const rows = names
    .map((name) => name.replace(/\.html$/, ""))
    .flatMap((base) =>
      WIDTHS.map(
        (width) =>
          `<h2>${base} · ${width}px</h2><div class="row">${modes
            .map(
              (mode) =>
                `<figure><img src="${base}/${mode}-${width}.png" alt="${base} ${mode} ${width}px"><figcaption>${mode}</figcaption></figure>`,
            )
            .join("")}</div>`,
      ),
    )
    .join("\n");
  mkdirSync(out, { recursive: true });
  writeFileSync(
    new URL("index.html", out),
    `<!doctype html><meta charset="utf-8"><title>Email renders</title><style>body{font:14px system-ui;margin:24px}.row{display:flex;gap:16px;align-items:flex-start;overflow-x:auto}figure{margin:0}img{border:1px solid #ccc;max-width:420px}</style>${rows}`,
  );
});
