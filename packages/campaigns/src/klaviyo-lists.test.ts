import { afterEach, describe, expect, it, vi } from "vitest";

import {
  addEmailsToList,
  getListByName,
  getListEmails,
  getListFlows,
  removeFromList,
} from "./klaviyo";
import { listSync } from "./segments";

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

describe("Klaviyo segment lists (writes)", () => {
  it("reads which flows a list triggers, with their status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        expect(url).toContain("/lists/L1/flow-triggers");
        return reply({
          data: [{ id: "F1", attributes: { name: "Welcome", status: "live" } }],
        });
      }),
    );
    expect(await getListFlows("k", "L1")).toEqual([
      { id: "F1", name: "Welcome", status: "live" },
    ]);
  });

  it("adds by email through a bulk import into the list, without touching consent", async () => {
    const fetch = vi.fn(async (_url: string, _init?: RequestInit) => reply({}));
    vi.stubGlobal("fetch", fetch);
    const emails = Array.from({ length: 10_001 }, (_, i) => `p${i}@double-helix.shop`);
    expect(await addEmailsToList("k", "L1", emails)).toBe(2);
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toMatch(/\/profile-bulk-import-jobs$/);
    const body = JSON.parse(String(init?.body));
    expect(body.data.relationships.lists.data).toEqual([{ type: "list", id: "L1" }]);
    expect(body.data.attributes.profiles.data).toHaveLength(10_000);
    expect(JSON.stringify(body)).not.toContain("subscriptions");
  });

  it("removes profiles from the list, 1,000 a request", async () => {
    const fetch = vi.fn(async (_url: string, _init?: RequestInit) => reply({}));
    vi.stubGlobal("fetch", fetch);
    await removeFromList(
      "k",
      "L1",
      Array.from({ length: 1001 }, (_, i) => `P${i}`),
    );
    expect(fetch).toHaveBeenCalledTimes(2);
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toMatch(/\/lists\/L1\/relationships\/profiles$/);
    expect(init?.method).toBe("DELETE");
  });
});

describe("listSync", () => {
  const list = (
    members: { id: string; email: string | null }[],
    flows: { name: string; status: string }[] = [],
  ) => ({ id: "L1", members, flows });

  it("creates a missing list with every member", () => {
    expect(listSync("lapsed", ["A@x.co", "b@x.co"], null)).toEqual({
      key: "lapsed",
      listId: null,
      add: ["a@x.co", "b@x.co"],
      remove: [],
      problem: null,
    });
  });

  it("adds new members and removes those who left, or have no email", () => {
    const plan = listSync(
      "lapsed",
      ["a@x.co", "c@x.co"],
      list([
        { id: "P1", email: "a@x.co" },
        { id: "P2", email: "b@x.co" },
        { id: "P3", email: null },
      ]),
    );
    expect(plan).toMatchObject({ listId: "L1", add: ["c@x.co"], remove: ["P2", "P3"] });
  });

  it("leaves a list alone when it triggers a live flow", () => {
    const plan = listSync(
      "lapsed",
      ["a@x.co"],
      list(
        [],
        [
          { name: "Draft one", status: "draft" },
          { name: "Win-back", status: "live" },
        ],
      ),
    );
    expect(plan.skip).toMatch(/live flow \(Win-back\)/);
  });

  it("is fine with draft and manual flows", () => {
    const plan = listSync(
      "lapsed",
      ["a@x.co"],
      list(
        [],
        [
          { name: "Draft one", status: "draft" },
          { name: "By hand", status: "manual" },
        ],
      ),
    );
    expect(plan.skip).toBeUndefined();
  });

  it("flags a sync that would empty most of a list", () => {
    const members = Array.from({ length: 20 }, (_, i) => ({
      id: `P${i}`,
      email: `p${i}@x.co`,
    }));
    const plan = listSync("lapsed", ["p0@x.co"], list(members));
    expect(plan.problem).toBe('"Segment: lapsed": would remove 19 of 20');
  });
});
