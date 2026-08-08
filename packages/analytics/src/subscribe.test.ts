import { afterEach, describe, expect, it, vi } from "vitest";

import {
  KLAVIYO_REVISION,
  isPlausibleEmail,
  looksFakeToKlaviyo,
  submitSubscription,
  subscriptionPayload,
  subscriptionsUrl,
} from "./subscribe";

const PUBLIC_KEY = "X2g4U5";
const LIST_ID = "ABC123";

describe("subscriptionsUrl", () => {
  it("carries the public key as company_id, not as a bearer token", () => {
    // The design of Klaviyo's client endpoints, and the reason this key is
    // safe in a client bundle at all.
    expect(subscriptionsUrl(PUBLIC_KEY)).toBe(
      "https://a.klaviyo.com/client/subscriptions/?company_id=X2g4U5",
    );
  });

  it("encodes the key rather than concatenating it raw", () => {
    expect(subscriptionsUrl("a b&c")).toContain("company_id=a%20b%26c");
  });
});

describe("isPlausibleEmail", () => {
  it("accepts ordinary addresses, including ones strict regexes reject", () => {
    for (const address of [
      "ben@bentaylordemo.co.uk",
      "ben+shopify@gmail.com",
      "b_t.1@sub.domain.io",
      "ben@x.co",
    ]) {
      expect(isPlausibleEmail(address), address).toBe(true);
    }
  });

  it("catches the typos a shopper actually makes", () => {
    for (const address of ["ben", "ben@", "@gmail.com", "ben@gmail", "a b@c.com", ""]) {
      expect(isPlausibleEmail(address), address).toBe(false);
    }
  });

  it("tolerates surrounding whitespace, because pasted addresses carry it", () => {
    expect(isPlausibleEmail("  ben@bentaylordemo.co.uk  ")).toBe(true);
  });
});

describe("looksFakeToKlaviyo", () => {
  it("flags the addresses Klaviyo silently discards", () => {
    // Every one of these returns 202 from Klaviyo and then vanishes. This
    // helper exists purely so a developer sees a warning instead of nothing.
    for (const address of [
      "klaviyo-probe@example.com",
      "someone@test.com",
      "test@bentaylordemo.co.uk",
      "fake.person@gmail.com",
      "dummy@shop.com",
    ]) {
      expect(looksFakeToKlaviyo(address), address).toBe(true);
    }
  });

  it("leaves a plausible address alone", () => {
    // The address that finally landed, after every @example.com probe failed.
    expect(looksFakeToKlaviyo("formulate.probe@bentaylordemo.co.uk")).toBe(false);
    expect(looksFakeToKlaviyo("ben@gmail.com")).toBe(false);
  });
});

describe("subscriptionPayload", () => {
  const payload = subscriptionPayload({
    email: "  ben@bentaylordemo.co.uk ",
    listId: LIST_ID,
    source: "Formulate web",
  });

  it("records explicit marketing consent", () => {
    expect(payload.data.attributes.profile.data.attributes.subscriptions).toEqual({
      email: { marketing: { consent: "SUBSCRIBED" } },
    });
  });

  it("relates the profile to the list, which the API requires", () => {
    expect(payload.data.relationships.list.data).toEqual({ type: "list", id: LIST_ID });
  });

  it("tags the surface, so segments can be built per runtime", () => {
    expect(payload.data.attributes.custom_source).toBe("Formulate web");
  });

  it("trims the address before sending it", () => {
    expect(payload.data.attributes.profile.data.attributes.email).toBe(
      "ben@bentaylordemo.co.uk",
    );
  });
});

describe("submitSubscription", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const stubFetch = (response: Partial<Response> | Error) => {
    const fetchMock = vi.fn(() =>
      response instanceof Error ? Promise.reject(response) : Promise.resolve(response),
    );
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  };

  const input = {
    publicKey: PUBLIC_KEY,
    listId: LIST_ID,
    email: "ben@bentaylordemo.co.uk",
    source: "Formulate web",
  } as const;

  it("sends the JSON:API media type and the pinned revision", async () => {
    const fetchMock = stubFetch({ ok: true, status: 202 });

    await submitSubscription(input);

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.headers).toEqual({
      // Klaviyo rejects application/json on this endpoint.
      "Content-Type": "application/vnd.api+json",
      revision: KLAVIYO_REVISION,
    });
  });

  it("succeeds on 202", async () => {
    stubFetch({ ok: true, status: 202 });
    expect(await submitSubscription(input)).toEqual({ ok: true });
  });

  it("rejects a mistyped address without calling the network", async () => {
    const fetchMock = stubFetch({ ok: true, status: 202 });

    expect(await submitSubscription({ ...input, email: "ben@" })).toEqual({
      ok: false,
      reason: "invalid-email",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("distinguishes an empty field from a malformed address", async () => {
    // The forms set `novalidate` to own their messaging, which means they own
    // the empty case too. "That doesn't look like an email address" is a
    // strange thing to tell someone who typed nothing.
    stubFetch({ ok: true, status: 202 });
    expect(await submitSubscription({ ...input, email: "   " })).toEqual({
      ok: false,
      reason: "empty",
    });
  });

  it("reports a missing key or list as configuration, not as a shopper error", async () => {
    // Otherwise an unconfigured deployment tells visitors their address is
    // invalid, which sends them to fix the one thing that is not broken.
    stubFetch({ ok: true, status: 202 });
    expect(await submitSubscription({ ...input, listId: "" })).toEqual({
      ok: false,
      reason: "not-configured",
    });
    expect(await submitSubscription({ ...input, publicKey: "" })).toEqual({
      ok: false,
      reason: "not-configured",
    });
  });

  it("surfaces the status when Klaviyo refuses", async () => {
    stubFetch({ ok: false, status: 400 });
    expect(await submitSubscription(input)).toEqual({
      ok: false,
      reason: "rejected",
      status: 400,
    });
  });

  it("returns a network result rather than throwing", async () => {
    // The `http://` case: Klaviyo derives its URLs from the page protocol, so
    // on `next dev` this request never completes. A throw here would take the
    // page down over a newsletter form.
    stubFetch(new TypeError("Failed to fetch"));
    expect(await submitSubscription(input)).toEqual({ ok: false, reason: "network" });
  });
});
