# Accessible commerce forms

> Draft (SHO-119). Rewrite in your own words.

**For:** any store selling into the EU. The **European Accessibility Act** has
applied to e-commerce since 28 June 2025, so accessibility is a commercial
requirement, not only a quality one. Few people in this market are positioned
on it.

**What "accessible" means here, concretely:**

- every field has a real label, not a placeholder;
- an error is tied to its field (`aria-invalid` and a described-by message,
  set from the actual state) and announced, not only painted red;
- results and confirmations are announced (live regions on web; on iOS, where
  React Native's live regions don't work, an explicit announcement);
- everything works by keyboard, with visible focus;
- colour contrast checked, and fixed where the brand palette failed (the
  original success green measured 3.29:1).

**Proof:** automated axe checks against WCAG 2.2 AA run in CI on the web
storefront and the Liquid theme, and in the app's end-to-end suite;
keyboard-only tests cover the cart and the product page.

**Recording to make:** the email sign-up with VoiceOver on: an invalid
address announced as an error on the field, then the success message
announced.
