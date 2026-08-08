/**
 * Ambient declarations for globals the theme's JavaScript touches but does not
 * own.
 *
 * Lives outside `assets/` on purpose. The Shopify CLI only syncs the known
 * theme directories, so a `types/` folder at the theme root is typechecked
 * locally and never uploaded — whereas a `.d.ts` in `assets/` would be pushed
 * to the store as a theme asset.
 */

declare global {
  interface Window {
    /**
     * Klaviyo's event queue, installed by the app embed's `klaviyo.js`.
     *
     * ⚠️ This — never `window.klaviyo`. The latter is a real object exposing
     * `push`, so calling it throws no error and does nothing at all. Assigning
     * an array to it is worse: it shadows the object the script wants to
     * install, and every event lands somewhere nothing drains.
     *
     * Typed as an array union because it genuinely is one until `klaviyo.js`
     * loads and replaces it with something that consumes each `push`
     * immediately. That is what makes the queue-style API work at all.
     *
     * See docs/integration-klaviyo.md.
     */
    _learnq?: { push: (args: unknown[]) => void } | unknown[];
  }
}

export {};
