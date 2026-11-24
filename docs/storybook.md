# Storybook

One Storybook for the web storefront and the Expo app. The app's components
are composed in under **App (React Native)**, so each shared component's two
implementations sit side by side.

```bash
pnpm storybook         # web on :6006 (with the app composed in), app on :6007
pnpm storybook:test    # every story, both apps, as tests in headless Chromium
pnpm storybook:build   # one static site: apps/web/storybook-static (app under /app)
```

## What a story is here

- **Shared data.** Stories use `@formulate/shopify/fixtures`: real catalogue
  products, carts and suggestions, typed against the Storefront API's own
  query types. Web and app render the same data, so differences are in the
  components, not the inputs. Production code never imports it.
- **A test, not just a picture.** `storybook:test` runs every story in
  Chromium through Vitest (`@storybook/addon-vitest`):
  - the story must render;
  - its `play` function, if it has one, must pass (for example, sign-up
    success and failure, or the cart drawer taking focus);
  - axe must find no WCAG 2.2 AA violation (`a11y.test: "error"`).
- **No network.** Server Actions and Klaviyo (web) and the cart hooks,
  Klaviyo and navigation (app) are mocked. Stories set results with
  `mocked(...)`.

The axe checks found three contrast failures on their first run. All three
were in states the page-level Playwright scans never reach: the "No image"
card placeholder and both texts in the Shopify error box. That's the reason
to test components, and not only pages.

## Web (`apps/web/.storybook`)

`@storybook/nextjs-vite`. Stories cover client and presentational components.
Server Components that fetch from Shopify are covered by the Playwright suite
against the real store instead.

## App (`apps/mobile/.storybook`)

`@storybook/react-native-web-vite`: the app's components in a browser,
through React Native Web. Two small Vite plugins make that work:

- **`nativewind-web.ts`** ports NativeWind's web resolver from Metro. NativeWind
  v5 styles components through react-native-css's wrappers. Metro swaps them
  in for `react-native`; Vite doesn't, so without the plugin every
  `className` is silently ignored.
- **`story-mocks.ts`** redirects `expo-router`, `expo-image` and the app's
  Klaviyo and cart modules to hand-written mocks at resolve time. Storybook's
  `sb.mock` still loads the real module, and Expo's native layer can't load
  in a browser.

This is the browser view of the components, so it checks logic, markup and
web accessibility. Native behaviour is still checked on a device:
VoiceOver announcements, haptics and the checkout sheet.

## Not covered: the Liquid theme

Liquid renders only inside Shopify, with Shopify's objects and filters.
Tools that run Liquid in Storybook stub those out, which defeats the point.
The planned equivalent is a hidden style-guide page in the theme, rendered
by Shopify itself.

## CI

The `Storybook` job in `ci.yml` runs `storybook:test` and builds the site as a
downloadable artifact on every PR.
