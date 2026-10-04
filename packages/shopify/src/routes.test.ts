import { readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { describe, expect, it } from "vitest";

import { APP_IDENTIFIERS, SHARED_ROUTES, SURFACE_ONLY_ROUTES, paths } from "./routes";

/**
 * The parity test (SHO-63): both apps' route files, compared with the
 * contract. It reads the apps' source trees from here because the contract
 * lives here; it's the one test in this package that looks outside it.
 */

const repo = join(__dirname, "..", "..", "..");

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });

/** A route pattern from a route file, with route groups like (tabs) removed. */
const toPattern = (root: string, file: string, strip: RegExp): string => {
  const parts = relative(root, file)
    .split(sep)
    .filter((part) => !/^\(.*\)$/.test(part));
  const last = (parts.pop() ?? "").replace(strip, "");
  if (last && last !== "page" && last !== "index") parts.push(last);
  return `/${parts.join("/")}`;
};

const webRoutes = (): string[] => {
  const root = join(repo, "apps/web/app");
  return files(root)
    .filter((file) => file.endsWith(`${sep}page.tsx`))
    .map((file) => toPattern(root, file, /\.tsx$/));
};

const mobileRoutes = (): string[] => {
  const root = join(repo, "apps/mobile/app");
  return files(root)
    .filter(
      (file) => file.endsWith(".tsx") && !/(^|\/)(_layout|\+[a-z-]+)\.tsx$/.test(file),
    )
    .map((file) => toPattern(root, file, /\.tsx$/));
};

const expected = (surface: "web" | "mobile") =>
  [...SHARED_ROUTES, ...Object.keys(SURFACE_ONLY_ROUTES[surface])].sort();

describe("route parity", () => {
  it("web has the shared routes plus its declared extras, and nothing else", () => {
    expect([...new Set(webRoutes())].sort()).toEqual(expected("web"));
  });

  it("the app has the shared routes plus its declared extras, and nothing else", () => {
    // Shop and Search share one folder mounted twice, so each path appears once.
    expect([...new Set(mobileRoutes())].sort()).toEqual(expected("mobile"));
  });

  it("matches the identifiers in app.config.ts", async () => {
    const { readFileSync } = await import("node:fs");
    const config = readFileSync(join(repo, "apps/mobile/app.config.ts"), "utf8");
    expect(config).toContain(`bundleIdentifier: "${APP_IDENTIFIERS.ios}"`);
    expect(config).toContain(`package: "${APP_IDENTIFIERS.android}"`);
  });
});

describe("paths", () => {
  it("builds each shared path, encoding handles and queries", () => {
    expect(paths.product("whey-protein")).toBe("/products/whey-protein");
    expect(paths.collection("mind & focus")).toBe("/collections/mind%20%26%20focus");
    expect(paths.search()).toBe("/search");
    expect(paths.search("omega 3")).toBe("/search?q=omega+3");
    expect(paths.home()).toBe("/");
  });
});
