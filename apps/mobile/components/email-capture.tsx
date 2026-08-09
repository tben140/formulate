import { useState } from "react";
import {
  AccessibilityInfo,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";

import { identify } from "../lib/klaviyo";

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
 * ⚠️ **It does less than they do, on purpose.** Those two record marketing
 * consent through `/client/subscriptions/`. This surface cannot reach that
 * endpoint — Cloudflare blocks Klaviyo's `/client/` APIs from a native app —
 * and the SDK that replaces them has no consent API at all.
 *
 * So this identifies and nothing more, and the copy says so. When the consent
 * route lands, the marketing wording comes back with it. See lib/klaviyo.ts.
 */
export const EmailCapture = () => {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [failed, setFailed] = useState(false);
  const [pending, setPending] = useState(false);

  const onSubmit = () => {
    if (pending) return;
    setPending(true);

    if (email.trim() === "") {
      const message = "Enter your email address.";
      setStatus({ kind: "done", message });
      setFailed(true);
      announce(message);
      setPending(false);
      return;
    }

    if (!identify(email)) {
      const message = "That doesn't look like an email address. Check it and try again.";
      setStatus({ kind: "done", message });
      setFailed(true);
      announce(message);
      setPending(false);
      return;
    }

    /*
     * ⚠️ "Saved", not "You're on the list" — and the difference is not
     * pedantry.
     *
     * The SDK identifies the profile and records **no marketing consent**;
     * it has no API that can. Telling someone they are subscribed when no
     * consent record exists is the one claim this form must never make,
     * because it is the claim with legal weight behind it.
     *
     * The other two surfaces say "You're on the list" because they call
     * `/client/subscriptions/` with an explicit consent block. Mobile cannot
     * reach that endpoint — Cloudflare blocks it — so until the consent route
     * is decided, this form promises only what it delivers.
     */
    const message = "Saved. We'll use this to personalise your app.";
    setStatus({ kind: "done", message });
    setFailed(false);
    setEmail("");
    announce(message);
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
        Personalise your app
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
          accessibilityLabel="Email address"
          accessibilityHint="Links your orders across devices. We won't email you without asking first."
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
            {pending ? "Saving…" : "Save"}
          </Text>
        </Pressable>
      </View>

      {/*
        ⚠️ Deliberately does NOT promise marketing email, unlike web and theme.

        Those two record explicit consent through `/client/subscriptions/`, so
        their copy can offer a newsletter. This surface cannot reach that
        endpoint and the SDK has no consent API, so offering one here would be
        collecting an address under a promise nothing has recorded.

        Restore the marketing copy when the consent route lands — not before.
      */}
      <Text className="mt-2 text-xs text-foreground-muted">
        Links your orders across devices. We won&apos;t email you without asking first.
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
