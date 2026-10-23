# Apple developer account: setting up builds, TestFlight and links

What to do once the paid Apple Developer Program membership exists, in order.
Steps marked **Ben** need the account holder; the rest are code or config.

## Why

Expo Go only runs native code that's built into Expo Go. A paid account
(£79 a year, "Individual") lets us build **our own** app: needed for push
notifications (SHO-165), Shopify's native checkout sheet, Klaviyo's native
push, universal links (#66), Sentry native crash reports (#98), writing to
Apple Health (ADR 0009's allowed use), and a TestFlight link to share.

## 1. Join the programme (Ben, once)

1. developer.apple.com → Account → Join the Apple Developer Program, as an
   **Individual**. Apple verifies identity; usually 1–2 days.
2. Note the **Team ID** (10 characters): Membership details. It isn't secret.

## 2. Link EAS (Ben, about 10 minutes, on the laptop)

```sh
cd apps/mobile
npx eas-cli login           # the Expo account, as with `expo login`
npx eas-cli init            # creates the EAS project; prints its id
```

- Done 2026-10-20: the project is `@tben140/formulate`, and its id is in
  `app.config.ts` (`extra.eas.projectId`). `eas init` can't write to a `.ts`
  config, so it prints the id instead. `EAS_PROJECT_ID` still overrides it.
- Bundle identifier: `com.tben140.doublehelix` (app.config.ts, chosen
  2026-10-20). **It becomes permanent at the first upload.**

## 3. First build and TestFlight (Ben approves, EAS does the rest)

```sh
npx eas-cli build --platform ios --profile production --auto-submit
```

- EAS asks to sign in to Apple once, then creates the certificates,
  provisioning profile and **push key (APNs)** itself. Say yes to each.
- `--auto-submit` uploads to App Store Connect, creating the app record the
  first time ("Double Helix"). After Apple's processing (10–30 minutes) it
  appears in TestFlight.
- `ios.config.usesNonExemptEncryption: false` answers the encryption question
  for every upload.
- **TestFlight testers:** internal testers (you) straight away; external
  testers (a public link for employers) after a short Beta App Review.

## 4. A development build for your iPhone (replaces Expo Go)

```sh
npx eas-cli device:create   # registers the iPhone (open the link on it)
npx eas-cli build --platform ios --profile development
```

Uses `expo-dev-client` (57.0.19, added on 19 October once its dependencies
passed the 7-day rule).

The **preview** profile is the same for sharing an installable build with
registered devices, without the store.

## 5. Universal links (after #66 merges)

- Vercel (web), Production: `APPLE_TEAM_ID` = the Team ID from step 1. Web
  then serves `/.well-known/apple-app-site-association` (#66).
- EAS environment variable `EXPO_PUBLIC_WEB_URL` = the web store's production
  URL. app.config.ts then declares `applinks:<host>`, the iOS twin of
  Android's app links.
- Test: open a product link from Notes on the iPhone; it should open the app.

## 6. Then, in order of value

1. **Push v1 (SHO-165):** `expo-notifications`, the permission prompt and
   token registration with Klaviyo. The APNs key from step 3 is already in
   EAS.
2. **Shopify's checkout sheet** in the app.
3. **Sentry's native crash reports** (#98's build plugin).
4. **Apple Health writes** (ADR 0009), after the ADR is accepted.

## 7. Apple Pay in the app (accelerated checkouts)

Apple Pay buttons on the product and cart screens need a payment processing
certificate that Shopify can decrypt with.

1. **Merchant ID:** Apple Developer → Identifiers → + → Merchant IDs →
   `merchant.com.tben140.doublehelix`.
2. **Permissions:** ask Shopify for `write_mobile_payments` and
   `read_mobile_payments` (the certificate) and `write_cart_wallet_payments`
   (the buttons), using the form linked from
   [Create Apple Pay certificates](https://shopify.dev/docs/storefronts/mobile/create-apple-payment-processing-certificates).
   Say plainly that it's a development store for a portfolio project, in test
   mode. Approval isn't guaranteed for a store with no business behind it.
3. **Once approved,** in an empty folder outside the repo:
   ```sh
   path/to/apps/mobile/scripts/apple-pay-certificate.sh request
   ```
   It asks for the app's Admin API token without showing it, and saves
   `apple_payment_processing.csr`.
4. **Apple Developer** → Certificates → + → **Apple Pay Payment Processing
   Certificate** (not Merchant Identity, which is for websites) → upload the
   `.csr` → download `apple_pay.cer`.
5. ```sh
   path/to/apps/mobile/scripts/apple-pay-certificate.sh upload apple_pay.cer
   ```
6. Set `EXPO_PUBLIC_APPLE_PAY_MERCHANT_ID` in EAS to the merchant ID.

Certificates last 25 months; repeat this before it expires.

## Secrets

None of the above goes in the repository. The Apple sign-in happens in EAS's
prompt; certificates and the push key live in EAS. An `EXPO_TOKEN` for building
from CI would go in GitHub Actions secrets, later and only if wanted.
