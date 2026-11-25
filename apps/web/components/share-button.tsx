"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

/** True once hydrated: the button does nothing without JavaScript. */
const useHydrated = (): boolean =>
  useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

/**
 * Share this page (SHO-63), matching the app's header button and the theme's
 * `<share-button>`. The system share sheet where the browser has one (phones,
 * Safari); otherwise the link is copied. Not rendered until hydrated, so it
 * is never a dead button.
 */
export const ShareButton = ({ url, title }: { url: string; title: string }) => {
  const hydrated = useHydrated();
  const [copied, setCopied] = useState(false);
  // One confirmation timer: a second copy restarts it rather than being cut
  // short by the first one's.
  const reset = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(reset.current), []);
  if (!hydrated) return null;

  const share = async () => {
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title, url });
        return;
      } catch (error) {
        // A cancelled sheet rejects with AbortError: nothing to say about it.
        // Anything else (NotAllowedError under a permissions policy) falls
        // through to copying the link, as the theme's button does.
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      clearTimeout(reset.current);
      reset.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      // No clipboard either (an insecure origin): the address bar has the link.
    }
  };

  return (
    <button
      type="button"
      onClick={() => void share()}
      aria-label={`Share ${title}`}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-surface-muted"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 20 20"
        className="h-4 w-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M10 3v10M6 7l4-4 4 4M4 11v5h12v-5" />
      </svg>
      <span aria-live="polite">{copied ? "Link copied" : "Share"}</span>
    </button>
  );
};
