import { useState } from "react";
import {
  AccessibilityInfo,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";

import type { SubscribeResult } from "@formulate/analytics";

import { subscribe } from "../lib/klaviyo";
import { useIdentifyBuyer } from "../lib/use-cart";

/**
 * Turns a failure into something a shopper can act on.
 *
 * Wording matched to apps/web's `errorMessage` — three surfaces disagreeing
 * about what a failure is called reads as three different products.
 */
const errorMessage = (result: Extract<SubscribeResult, { ok: false }>): string => {
  switch (result.reason) {
    case "empty":
      return "Enter your email address.";
    case "invalid-email":
      return "That doesn't look like an email address. Check it and try again.";
    case "rate-limited":
      // Deliberately not "you have been rate limited". The shopper did nothing
      // wrong and does not care about our controls; they need to know to wait.
      return "Too many attempts. Please wait a minute and try again.";
    case "not-configured":
      return "Sign-up isn't available at the moment.";
    case "network":
      return "We couldn't reach our email service. Check your connection and try again.";
    case "rejected":
      return "Something went wrong at our end. Please try again.";
  }
};

/**
 * Announces a message to a screen reader.
 *
 * ⚠️ There is no cross-platform `aria-live` here. React Native's
 * `accessibilityLiveRegion` prop is **Android only** — it does nothing on iOS,
 * which is the platform this app is actually verified on. iOS needs an
 * imperative `announceForAccessibility` call instead.
 *
 * So the same behaviour that one HTML attribute buys on web takes a prop *and*
 * a function call here, and using only the prop would silently ship a form
 * whose errors are invisible to VoiceOver. Both are wired up below.
 */
const announce = (message: string): void => {
  if (Platform.OS === "ios" && message) {
    AccessibilityInfo.announceForAccessibility(message);
  }
};

type Status = { readonly kind: "idle" } | { readonly kind: "done"; readonly message: string };

/**
 * Email capture, the mobile counterpart to apps/web's <EmailCapture /> and the
 * theme's <email-capture> element.
 *
 * Identical copy and behaviour, reached by a different route. Web and theme
 * record consent straight from the client; this surface cannot — Cloudflare
 * blocks Klaviyo's `/client/` APIs from a native app, and the SDK has no
 * consent API — so it goes through `apps/api`, a worker holding a private key.
 *
 * The divergence is entirely below this component. That is the point: three
 * runtimes, three transports, one shopper-facing promise. See lib/klaviyo.ts.
 */
export const EmailCapture = () => {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [failed, setFailed] = useState(false);
  const [pending, setPending] = useState(false);
  const identifyBuyer = useIdentifyBuyer();

  const onSubmit = async () => {
    if (pending) return;
    setPending(true);

    const result = await subscribe(email);

    if (result.ok) {
      /*
       * Carry the address to the cart as well as to Klaviyo.
       *
       * Klaviyo now knows who this is; Shopify does not, and Shopify is what
       * records the abandoned checkout the lifecycle flow triggers on. Two
       * systems, one shopper — identity has to be propagated at each handoff,
       * not just established once.
       */
      identifyBuyer.mutate(email);

      /*
       * "You're on the list", matching web and theme — now truthful here too,
       * because the worker records an actual consent record. Before that
       * existed this form said only "Saved", since claiming a subscription
       * nothing had recorded was the one thing it must never do.
       */
      const message = "You're on the list. Check your inbox.";
      setStatus({ kind: "done", message });
      setFailed(false);
      setEmail("");
      announce(message);
    } else {
      const message = errorMessage(result);
      setStatus({ kind: "done", message });
      setFailed(true);
      announce(message);
    }

    setPending(false);
  };

  return (
    <View className="mt-6">
      {/*
        No <label> element exists here, so the accessible name has to come from
        `accessibilityLabel` on the input itself. The visible Text below is
        therefore decoration as far as assistive tech is concerned, which is
        why the label text is repeated rather than referenced.
      */}
      <Text className="text-sm font-semibold text-foreground">
        Get restock and subscription news
      </Text>

      <View className="mt-2 flex-row gap-2">
        <TextInput
          value={email}
          onChangeText={(next) => {
            setEmail(next);
            // Clear a stale message as they start correcting it, otherwise it
            // contradicts what is now in the field.
            if (status.kind === "done") setStatus({ kind: "idle" });
            setFailed(false);
          }}
          onSubmitEditing={onSubmit}
          editable={!pending}
          /*
           * ⚠️ The two that have no web equivalent and matter most.
           *
           * iOS capitalises the first letter of every field and autocorrects
           * as you type, so without these a shopper gets "Ben@gmail.con"
           * rendered back at them. Klaviyo lowercases addresses on its side,
           * so the capitalisation is survivable — the autocorrect is not.
           */
          autoCapitalize="none"
          autoCorrect={false}
          // Gives the @ key on the software keyboard.
          keyboardType="email-address"
          // textContentType drives iOS autofill; autoComplete drives Android.
          // Both are needed — neither platform reads the other's prop.
          textContentType="emailAddress"
          autoComplete="email"
          returnKeyType="go"
          placeholder="you@company.com"
          accessibilityLabel="Email address for restock and subscription news"
          accessibilityHint="Signs you up for marketing emails. Unsubscribe any time."
          className={`min-w-0 flex-1 rounded-md border px-3 py-2 text-sm text-foreground ${
            failed ? "border-danger" : "border-border"
          }`}
        />

        <Pressable
          onPress={onSubmit}
          disabled={pending}
          accessibilityRole="button"
          accessibilityState={{ disabled: pending, busy: pending }}
          className={`rounded-md px-4 py-2 ${pending ? "bg-ink-300" : "bg-brand-600"}`}
        >
          <Text className="text-sm font-semibold text-surface">
            {pending ? "Signing up…" : "Sign up"}
          </Text>
        </Pressable>
      </View>

      {/*
        An explicit statement of what is being consented to. Recording
        SUBSCRIBED against someone who was never told is the real GDPR problem
        — the cookie question is the lesser one, and does not arise here.
      */}
      <Text className="mt-2 text-xs text-foreground-muted">
        Marketing emails about restocks and subscription offers. Unsubscribe any time.
      </Text>

      {/*
        `accessibilityLiveRegion` covers Android; `announce()` covers iOS. See
        the note on `announce` — neither alone is enough.
      */}
      <Text
        accessibilityLiveRegion="polite"
        className={`mt-2 min-h-5 text-sm ${failed ? "text-danger" : "text-success"}`}
      >
        {status.kind === "done" ? status.message : ""}
      </Text>
    </View>
  );
};
