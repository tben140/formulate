# Email testing

How every Double Helix email is checked before it reaches a customer, the way
an email agency would: in light and dark mode, across the inboxes people use,
on phones and desktops.

Emails are built in [`packages/emails`](../packages/emails). Klaviyo sends
them; nothing here sends anything.

## The four stages

| Stage                 | What                                                                     | Cost | When                      |
| --------------------- | ------------------------------------------------------------------------ | ---- | ------------------------- |
| 1. Automated checks   | Client support, structure, accessibility, contrast and screenshots in CI | Free | Every change              |
| 2. Real devices       | Klaviyo test sends to real inboxes, checked against the matrix below     | Free | Before an email goes live |
| 3. Spam and sign-in   | mail-tester.com score; SPF, DKIM and DMARC on the domain                 | Free | Once, then per campaign   |
| 4. Screenshot service | Email on Acid or Litmus: about 90 real clients                           | Paid | Not used (decided 22 Nov) |

## 1. Automated checks

`pnpm --filter @formulate/emails check` runs on every template (or on the
files you name) and prints what to fix:

- **Client support.** Every HTML and CSS feature is looked up in
  [caniemail.com](https://www.caniemail.com)'s data for Apple Mail, Gmail,
  Outlook, Yahoo and Samsung Email, on every platform. A feature some of
  them don't support fails, unless it's in `HANDLED` in
  `packages/emails/src/check.ts` with the reason it's safe (usually: it's a
  refinement, and the email still works without it).
- **Structure.** Dark mode declared (`color-scheme` meta tags) and styled
  (`prefers-color-scheme: dark`, plus Outlook.com's `[data-ogsc]` hooks);
  `lang` set; layout tables marked `role="presentation"`; every image with
  alt text and a width; links that are https and point at the public site;
  an unsubscribe link; no scripts or forms; under Gmail's 102 KB clipping
  limit.

`pnpm --filter @formulate/emails test:render` then renders each template with
Playwright:

| Mode           | What it stands for                                                                              |
| -------------- | ----------------------------------------------------------------------------------------------- |
| light          | Most clients by day                                                                             |
| dark           | Clients that use the email's own dark styles: Apple Mail, iOS Mail, Outlook for Mac             |
| forced-dark    | Clients that invert the email themselves and ignore its dark styles: the Gmail and Outlook apps |
| light-no-style | Clients that strip `<style>`, such as Gmail with a non-Google account: inline styles only       |

Each runs at 375px (a phone) and 800px (a desktop reading pane). The test
fails on sideways scrolling and on any WCAG 2.2 AA problem axe finds in
light or dark, contrast included. The screenshots and a contact sheet
(`screenshots/index.html`) are uploaded as the `email-renders` artifact of
the **Emails** workflow, to look through by eye.

## 2. Real devices

Make the email a Klaviyo **draft** (never scheduled or live without Ben's
yes), then use **Preview and test → Send test email** to these inboxes.
Check each in light and dark mode.

| Client              | Device              | Light | Dark | Notes                          |
| ------------------- | ------------------- | :---: | :--: | ------------------------------ |
| Apple Mail          | iPhone              |   ☐   |  ☐   | Uses the email's dark styles   |
| Gmail app           | iPhone              |   ☐   |  ☐   | Inverts colours itself         |
| Gmail app           | Android, if to hand |   ☐   |  ☐   | Inverts colours itself         |
| Gmail               | Web, desktop        |   ☐   |  —   | No dark mode for email content |
| Outlook.com         | Web, desktop        |   ☐   |  ☐   | Uses `[data-ogsc]` styles      |
| Outlook app         | iPhone              |   ☐   |  ☐   |                                |
| Outlook for Mac     | Mac, if installed   |   ☐   |  ☐   | Uses the email's dark styles   |
| Outlook for Windows | Windows PC          |   ☐   |  ☐   | Only if a PC is to hand        |

In each, check that:

- the logo, headline and button read clearly, with no dark text on a dark
  background;
- the preview line in the inbox is the one written for it;
- every link opens the right page on www.doublehelixsupplements.co.uk;
- with images turned off, the email still makes sense.

Test sends fill the unsubscribe and preferences links with placeholders, so
they can't show those links work. Check them once per template with a live
send to a list holding only a test profile of Ben's: that's a real send, so
it needs Ben's yes like any other.

## 3. Spam and sign-in

- **Once:** the sending domain (Klaviyo's branded sending domain on
  doublehelixsupplements.co.uk) passes SPF, DKIM and DMARC. Klaviyo's
  sending domain page shows each.
- **Per campaign:** send a test to the address
  [mail-tester.com](https://www.mail-tester.com) gives you, and aim for 9/10
  or better. It flags spammy wording, broken sign-in and blocklisted links.

## 4. Screenshot service (not used)

Email on Acid and Litmus render an email in about 90 real clients and
devices, including Outlook for Windows, in light and dark. They're the
agency standard, but neither has a free plan (Email on Acid starts at about
$74 a month), so Ben decided on 22 November 2026 to stay with the free
stages. The gap that leaves is Outlook for Windows: with no PC to hand, the
MSO-only parts of a template (the ghost table, the button's `bgcolor`) go
untested, so keep them to the patterns in the starter, which are the
standard ones.

## Building an email

Start from `packages/emails/templates/starter.html`. It carries the dark
palette (the ink and brand scales from `@formulate/tokens`), the
Outlook-safe button, the hidden preheader, and the footer Klaviyo requires.
Keep every colour and size inline as well as in `<style>`: the styles in
`<style>` are refinements that some clients drop. Add a new template next to
it; the checks and renders pick it up.
