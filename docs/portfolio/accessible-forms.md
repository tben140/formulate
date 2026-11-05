# Accessible commerce forms

> Draft. Rewrite in your own words.

**For:** a store selling to consumers in the EU. The **European Accessibility
Act** has applied to e-commerce services since 28 June 2025 (microenterprises
providing services are exempt, and the detail depends on each country's
implementing law), so for most such stores accessibility is a commercial
requirement, not only a quality one. Few people in this market are positioned
on it.

**What "accessible" means here, concretely:**

- every field has a real label, not a placeholder;
- on web and the Liquid theme, an error is tied to its field (`aria-invalid`
  and a described-by message, set from the actual state) and announced, not
  only painted red; in the app it is announced and shown on the field;
- results and confirmations are announced (live regions on web; on iOS, where
  React Native's live regions don't work, an explicit announcement);
- everything works by keyboard, with visible focus;
- colour contrast checked, and fixed where the brand palette failed (the
  original success green measured 3.29:1).

**Proof:** on the web storefront, Playwright runs axe checks against WCAG 2.2
AA and keyboard-only tests of the cart and the product page, in the end-to-end
workflow on every change. The theme and the app are checked by hand.

**Recording to make:** the email sign-up with VoiceOver on: an invalid
address announced as an error on the field, then the success message
announced.
