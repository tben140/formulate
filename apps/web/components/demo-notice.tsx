import { DEMO_STORE_NOTICE } from "@formulate/shopify";

/**
 * The demo-store notice, above the header on every page.
 *
 * Deliberately not dismissible: it is a statement about what happens to an
 * order placed here, not a promotion, and it should still be there on the page
 * someone reaches checkout from. Server-rendered, so it costs no JavaScript.
 *
 * The same words appear on mobile (shared constant) and in the Liquid theme
 * (`sections/demo-notice.liquid`). See docs/demo-store.md.
 */
export const DemoNotice = () => (
  <div className="bg-ink-900 px-4 py-2 text-center text-xs text-surface sm:text-sm">
    <p className="mx-auto max-w-5xl">
      <strong className="font-semibold">{DEMO_STORE_NOTICE.label}</strong> —{" "}
      {DEMO_STORE_NOTICE.message}
    </p>
  </div>
);
