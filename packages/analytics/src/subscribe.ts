/**
 * Email capture — the identity moment.
 *
 * ⚠️ This is not a marketing nicety bolted onto the analytics work. It is a
 * **precondition** for it. Klaviyo does not transmit events for an
 * unidentified visitor: it caches them in the browser and sends nothing. So
 * until something here succeeds, every `Viewed Product` and `Added to Cart`
 * this project emits sits in a queue that is never drained, on all three
 * surfaces including the Liquid theme.
 *
 * See the identity section of docs/integration-klaviyo.md.
 *
 * Two steps, and both are needed:
 *
 * 1. `POST /client/subscriptions/` — creates the profile and records marketing
 *    consent against a list. This is the durable, server-side half.
 * 2. `_learnq.push(["identify", …])` — tells the copy of `klaviyo.js` running
 *    in *this browser* who the visitor is, which is what flushes the cached
 *    events. Step 1 alone leaves them cached, because the running script never
 *    learns anything happened.
 *
 * Step 2 lives in each app rather than here, because the queue is a browser
 * global and this package stays transport-agnostic enough to test.
 */

/**
 * Klaviyo's API version, pinned.
 *
 * Klaviyo versions by date and requires this header on every call. Omitting it
 * is one of the few things their API *does* reject loudly — an unversioned
 * request returns an error naming the header, which is how a previous probe in
 * this project failed.
 *
 * Pinning rather than tracking latest is deliberate: a date-versioned API that
 * silently follows head is a breaking change waiting for a quiet afternoon.
 */
export const KLAVIYO_REVISION = "2026-07-15";

/**
 * Where a client-side subscription is posted.
 *
 * The public key travels as `company_id` in the query string rather than as a
 * bearer token — that is the whole design of Klaviyo's client endpoints, and
 * why this key is safe in a client bundle. A **private** key must never be
 * sent here; it would be exposed to every visitor.
 */
export const subscriptionsUrl = (publicKey: string): string =>
  `https://a.klaviyo.com/client/subscriptions/?company_id=${encodeURIComponent(publicKey)}`;

/**
 * Where a profile is created or updated client-side.
 *
 * ⚠️ This is what `_learnq.push(["identify"])` calls under the hood on web.
 * Surfaces with `klaviyo.js` never touch it directly — the script owns it, and
 * calling it alongside would duplicate work and fight over the cookie. A
 * surface **without** the script has to call it itself or no profile is
 * created at all.
 *
 * Note what it does not do: record consent. Marketing consent comes from
 * `/client/subscriptions/` and only from there. Creating a profile is saying
 * "this person exists"; subscribing is saying "and they agreed to be emailed".
 * Conflating the two is how people end up emailing someone who never opted in.
 */
export const profilesUrl = (publicKey: string): string =>
  `https://a.klaviyo.com/client/profiles/?company_id=${encodeURIComponent(publicKey)}`;

/**
 * ⚠️ Klaviyo silently discards addresses it judges fake.
 *
 * `@example.com`, `@test.com`, and anything containing `test`, `invalid` or
 * `fake` are dropped on the client path — and the API returns `202` either
 * way. There is no public list of the patterns and no response that reveals
 * it. This cost roughly a day of this project's time.
 *
 * We cannot reproduce Klaviyo's filter, and should not try to: guessing wrong
 * would reject a real shopper. So this is **not** used to block a submission.
 * It exists so the surfaces can log a loud console warning in development,
 * turning an invisible failure into a visible one for whoever tests this next.
 *
 * The check is deliberately broader than the real one, because a false warning
 * costs a developer five seconds and a missed one costs an afternoon.
 */
export const looksFakeToKlaviyo = (email: string): boolean =>
  /@(example|test|invalid|localhost)\.|[._-]?(test|fake|invalid|dummy)[._-]?/i.test(
    email.toLowerCase(),
  );

/**
 * A deliberately permissive check: one `@`, something either side, a dot in
 * the domain, no whitespace.
 *
 * Not a full RFC 5322 validation, and not trying to be. Strict email regexes
 * are famous for rejecting valid addresses, and the real validation happens at
 * Klaviyo regardless. The only job here is to catch the typo — a missing `@`,
 * a trailing comma — before a shopper is told their address was accepted.
 */
export const isPlausibleEmail = (value: string): boolean =>
  /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(value.trim());

/**
 * Which surface a profile came from.
 *
 * Sent as Klaviyo's `custom_source`, so a segment can be built per surface.
 * That is worth more here than in a normal store: "the same shopper journey
 * across three runtimes" is the claim this project makes, and this is the
 * field that lets someone check it in a UI we do not control.
 */
export type SubscriptionSource = "Formulate web" | "Formulate theme" | "Formulate mobile";

interface SubscriptionInput {
  readonly email: string;
  readonly listId: string;
  readonly source: SubscriptionSource;
}

/**
 * Builds the JSON:API document Klaviyo expects.
 *
 * The nesting is not ours — `/client/subscriptions/` follows JSON:API, so a
 * profile arrives as a related resource with its own `data`/`type`/`attributes`
 * envelope rather than as a plain object. Getting a level wrong here produces
 * a 400 rather than a silent drop, which by this API's standards is generous.
 */
export const subscriptionPayload = ({ email, listId, source }: SubscriptionInput) => ({
  data: {
    type: "subscription",
    attributes: {
      custom_source: source,
      profile: {
        data: {
          type: "profile",
          attributes: {
            email: email.trim(),
            subscriptions: {
              // Explicit opt-in. The form states what is being consented to,
              // because recording SUBSCRIBED against someone who was not told
              // is the actual GDPR problem — not the cookie.
              email: { marketing: { consent: "SUBSCRIBED" } },
            },
          },
        },
      },
    },
    relationships: {
      list: { data: { type: "list", id: listId } },
    },
  },
});

/**
 * Why a subscription attempt did not succeed.
 *
 * A discriminated union rather than a thrown error, matching
 * `StorefrontResult` in packages/shopify: a shopper mistyping their address is
 * an expected outcome, not an exception.
 *
 * ⚠️ There is no `already-subscribed` case, and that is not an oversight —
 * see `submitSubscription`.
 */
export type SubscribeResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly reason:
        | "empty"
        | "invalid-email"
        | "rate-limited"
        | "not-configured"
        | "rejected"
        | "network";
      readonly status?: number;
      /**
       * Klaviyo's error body, verbatim, when it sends one.
       *
       * Carried through rather than discarded because this is the **one**
       * endpoint in the integration that reports a real cause, and throwing it
       * away wastes the only diagnostic the API offers. A misconfigured list
       * returns:
       *
       *     {"errors":[{"code":"invalid","detail":"List not found",
       *       "source":{"pointer":"/data/relationships/list"}}]}
       *
       * Never rendered to a shopper — "List not found" is not their problem.
       * The surfaces log it and show something human.
       */
      readonly detail?: string;
    };

interface SubmitInput extends SubscriptionInput {
  readonly publicKey: string;
}

/**
 * Posts a subscription.
 *
 * ⚠️ **Klaviyo cannot tell us whether this address was already subscribed.**
 * The endpoint returns `202 Accepted` for a brand-new profile and for one that
 * has been on the list for a year, with an empty body in both cases —
 * subscription is processed asynchronously, long after the response is sent.
 * Distinguishing them would need a *private* key and a server-side lookup,
 * which this project deliberately does not have (see the root AGENTS.md).
 *
 * So the surfaces must not claim "Thanks for subscribing!" — that is a
 * statement we cannot support. They say "You're on the list", which is true in
 * both cases. Wording the success state around what the API actually tells you
 * is the honest fix; inventing a state it does not report is not.
 *
 * `202` also means *queued*, never *recorded*. A well-formed request for an
 * address Klaviyo judges fake returns `202` and vanishes.
 */
export const submitSubscription = async ({
  publicKey,
  email,
  listId,
  source,
}: SubmitInput): Promise<SubscribeResult> => {
  /*
   * Empty is separated from malformed because the surfaces set `novalidate`.
   *
   * Native constraint validation fires before a submit handler and shows a
   * browser bubble that screen readers announce inconsistently — so the forms
   * turn it off and own the messaging, which means they also own the empty
   * case the browser used to cover. "That doesn't look like an email address"
   * is a strange thing to tell someone who typed nothing.
   */
  if (email.trim() === "") return { ok: false, reason: "empty" };
  if (!isPlausibleEmail(email)) return { ok: false, reason: "invalid-email" };
  if (!publicKey || !listId) return { ok: false, reason: "not-configured" };

  try {
    const response = await fetch(subscriptionsUrl(publicKey), {
      method: "POST",
      headers: {
        // Klaviyo rejects application/json here. JSON:API requires its own
        // media type, and this endpoint enforces it.
        "Content-Type": "application/vnd.api+json",
        revision: KLAVIYO_REVISION,
      },
      body: JSON.stringify(subscriptionPayload({ email, listId, source })),
    });

    if (!response.ok) {
      // `.text()` rather than `.json()`: a gateway error or an empty body
      // would throw on parse, turning a diagnosable rejection into the
      // catch-all network case below.
      const detail = await response.text().catch(() => "");
      return { ok: false, reason: "rejected", status: response.status, detail };
    }

    return { ok: true };
  } catch {
    // A network failure, an offline browser, or — the one that caught this
    // project out — an `http://` page, where Klaviyo's own URLs are derived
    // from the page protocol and the request never completes.
    return { ok: false, reason: "network" };
  }
};

/**
 * Builds the profile document.
 *
 * Deliberately carries the email and nothing else. Klaviyo accepts names,
 * addresses and arbitrary properties here, and a form that asked for none of
 * them has no business inventing them.
 */
export const profilePayload = (email: string) => ({
  data: {
    type: "profile",
    attributes: { email: email.trim() },
  },
});

/**
 * Creates or updates a profile — the half of "identify" that is not about
 * flushing.
 *
 * ⚠️ **Only for surfaces without `klaviyo.js`.** On web and theme the script
 * owns this endpoint and calls it as part of `_learnq.push(["identify"])`;
 * calling it alongside would duplicate the write and fight over the cookie.
 * On native there is no script, so nothing calls it unless we do.
 *
 * That distinction is easy to miss, and missing it has a specific symptom:
 * subscribe alone creates **no visible profile** when the target list uses
 * double opt-in, because nothing joins the list until a confirmation link is
 * clicked. The surfaces that also identify get a profile immediately and look
 * fine; the one that does not looks broken. Which is exactly how this was
 * found.
 *
 * Reuses `SubscribeResult` rather than defining a near-identical type — the
 * failure modes are the same ones, for the same reasons.
 *
 * ⚠️ This does **not** record consent, and must never be treated as though it
 * does. Marketing consent comes from `submitSubscription` alone.
 */
export const submitProfile = async ({
  publicKey,
  email,
}: {
  readonly publicKey: string;
  readonly email: string;
}): Promise<SubscribeResult> => {
  if (email.trim() === "") return { ok: false, reason: "empty" };
  if (!isPlausibleEmail(email)) return { ok: false, reason: "invalid-email" };
  if (!publicKey) return { ok: false, reason: "not-configured" };

  try {
    const response = await fetch(profilesUrl(publicKey), {
      method: "POST",
      headers: {
        "Content-Type": "application/vnd.api+json",
        revision: KLAVIYO_REVISION,
      },
      body: JSON.stringify(profilePayload(email)),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      return { ok: false, reason: "rejected", status: response.status, detail };
    }

    return { ok: true };
  } catch {
    return { ok: false, reason: "network" };
  }
};

/**
 * The **server-side** subscribe endpoint.
 *
 * ⚠️ Different endpoint, different auth, different payload shape from
 * `subscriptionsUrl` above — they are not interchangeable. This one takes a
 * **private** key in an `Authorization` header and must therefore never be
 * called from a browser, an app bundle, or anywhere else a client can read.
 *
 * It exists because mobile has no other route: the SDK has no consent API, and
 * `/client/subscriptions/` is unreachable from a native app (Cloudflare serves
 * a 403 interstitial). See docs/adr/0007.
 */
export const SERVER_SUBSCRIBE_URL =
  "https://a.klaviyo.com/api/profile-subscription-bulk-create-jobs";

/**
 * Builds the server-side bulk-subscribe document.
 *
 * ⚠️ **Every field here is constructed, never forwarded.** The caller supplies
 * an email and nothing else; the list id comes from the worker's own config.
 * That is deliberate and structural: a proxy that merged a client-supplied
 * object into this payload would let anyone choose the list, set arbitrary
 * profile properties, or forge `custom_source`. Validating such a body is
 * harder than never accepting one.
 *
 * "Bulk" with a single profile is not a misuse — it is the only server-side
 * subscribe endpoint Klaviyo offers.
 */
export const serverSubscriptionPayload = ({ email, listId, source }: SubscriptionInput) => ({
  data: {
    type: "profile-subscription-bulk-create-job",
    attributes: {
      custom_source: source,
      profiles: {
        data: [
          {
            type: "profile",
            attributes: {
              email: email.trim(),
              subscriptions: {
                email: { marketing: { consent: "SUBSCRIBED" } },
              },
            },
          },
        ],
      },
    },
    relationships: {
      list: { data: { type: "list", id: listId } },
    },
  },
});
