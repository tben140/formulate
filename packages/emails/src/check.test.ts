import { readdirSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { checkEmail, checkStructure, checkSupport, GMAIL_CLIP_BYTES } from "./check";

const templates = new URL("../templates/", import.meta.url);
const read = (name: string) => readFileSync(new URL(name, templates), "utf8");
const starter = read("starter.html");

describe("the templates", () => {
  for (const name of readdirSync(templates).filter((file) => file.endsWith(".html"))) {
    it(`${name} passes every check`, () => {
      expect(checkEmail(read(name)).errors).toEqual([]);
    });
  }
});

describe("checkStructure", () => {
  const errorsFor = (html: string) => checkStructure(html).errors.join("\n");

  it("wants dark mode declared and styled", () => {
    const html = starter
      .replace(/<meta name="color-scheme"[^>]*>/, "")
      .replace(/<meta name="supported-color-schemes"[^>]*>/, "")
      .replace("@media (prefers-color-scheme: dark)", "@media (min-width: 1px)");
    const errors = errorsFor(html);
    expect(errors).toMatch('name="color-scheme"');
    expect(errors).toMatch('name="supported-color-schemes"');
    expect(errors).toMatch("prefers-color-scheme: dark");
  });

  it("wants lang, presentation tables and described images", () => {
    const html = starter
      .replace(/(<html[^>]*?)\s+lang="en"/, "$1")
      .replace(/role="presentation"(\s+class="container")/, "$1")
      .replace("</h1>", '</h1><img src="https://cdn.shopify.com/a.png">');
    const errors = errorsFor(html);
    expect(errors).toMatch("lang attribute");
    expect(errors).toMatch('role="presentation"');
    expect(errors).toMatch("no alt attribute");
    expect(errors).toMatch("width attribute");
  });

  it("checks links and the unsubscribe link", () => {
    const html = starter
      .replace("{% unsubscribe_link %}", "https://www.doublehelixsupplements.co.uk/")
      .replace(
        "https://www.doublehelixsupplements.co.uk/collections/best-sellers",
        "http://localhost:3000/",
      )
      .replace('href="mailto:', 'href="#" data-was="mailto:');
    const errors = errorsFor(html);
    expect(errors).toMatch("No unsubscribe link");
    expect(errors).toMatch("http://localhost:3000/ must be https:");
    expect(errors).toMatch("goes nowhere");
  });

  it("allows Klaviyo's template tags as link targets", () => {
    expect(errorsFor(starter)).not.toMatch("manage_preferences_link");
  });

  it("still wants text on a link whose target is a template tag", () => {
    const html = starter.replace(/>\s*Email preferences\s*</, "><");
    expect(errorsFor(html)).toMatch(
      "The link to {% manage_preferences_link %} has no text",
    );
  });

  it("refuses scripts and forms, and anything Gmail would clip", () => {
    const html = starter.replace(
      "</body>",
      `<script>1</script><form></form><!-- ${"x".repeat(GMAIL_CLIP_BYTES)} --></body>`,
    );
    const errors = errorsFor(html);
    expect(errors).toMatch("<script>");
    expect(errors).toMatch("<form>");
    expect(errors).toMatch("Gmail clips");
  });
});

describe("checkSupport", () => {
  it("passes features that degrade safely", () => {
    expect(checkSupport(starter).errors).toEqual([]);
  });

  it("fails a feature nobody has reviewed", () => {
    const html = starter.replace(
      "</h1>",
      '</h1><div style="display:grid; grid-template-columns:1fr 1fr"></div>',
    );
    expect(checkSupport(html).errors.join("\n")).toMatch(/grid/i);
  });
});
