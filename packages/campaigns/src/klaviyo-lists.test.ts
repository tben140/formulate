import { afterEach, describe, expect, it, vi } from "vitest";

import { getListByName, getListEmails } from "./klaviyo";

afterEach(() => {
  vi.unstubAllGlobals();
});

const reply = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

describe("Klaviyo segment lists (read only)", () => {
  it("finds a list by its exact name, or none", async () => {
    const fetch = vi.fn(async (url: string, _init?: RequestInit) =>
      reply({
        data: url.includes(encodeURIComponent('"Segment: lapsed"')) ? [{ id: "L1" }] : [],
      }),
    );
    vi.stubGlobal("fetch", fetch);
    expect(await getListByName("k", "Segment: lapsed")).toEqual({ id: "L1" });
    expect(await getListByName("k", "Segment: best")).toBeNull();
    expect(fetch.mock.calls.every(([, init]) => init?.method === undefined)).toBe(true);
  });

  it("reads every page of a list's emails, lower-cased", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.includes("page2")
          ? reply({
              data: [{ attributes: { email: "B@example.com" } }],
              links: { next: null },
            })
          : reply({
              data: [
                { attributes: { email: "a@example.com" } },
                { attributes: { email: null } },
              ],
              links: { next: "https://a.klaviyo.com/api/lists/L1/profiles?page2" },
            }),
      ),
    );
    expect(await getListEmails("k", "L1")).toEqual(["a@example.com", "b@example.com"]);
  });
});
