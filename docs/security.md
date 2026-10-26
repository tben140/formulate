# Security

How this repository keeps its dependencies, CI and secrets safe, what to do
when a security fix comes out, and the record of each audit. The dependency
rules agents follow are in [AGENTS.md](../AGENTS.md) (Dependencies).

## The defences

**Dependencies**

| Risk                                          | Defence                                                                                                                                                     | Where                                                |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| A hijacked npm release                        | Nothing younger than 7 days is installed, except a verified security fix (below)                                                                            | `minimumReleaseAge` in `pnpm-workspace.yaml`         |
| A release published from a stolen token       | pnpm refuses a version published with weaker trust than the package's earlier releases (e.g. no provenance where there used to be)                          | `trustPolicy: no-downgrade` in `pnpm-workspace.yaml` |
| A dependency pulled from outside the registry | Dependencies of dependencies may not come from git URLs or tarballs, where the age and trust rules don't apply                                              | `blockExoticSubdeps` in `pnpm-workspace.yaml`        |
| Install-time malware                          | pnpm runs install scripts only for allowlisted packages                                                                                                     | `allowBuilds` in `pnpm-workspace.yaml`               |
| A known vulnerability                         | CI fails on any high or critical advisory, and on moderate ones in what the apps run. The accepted exceptions are listed in config, each with a review date | `pnpm audit` in `ci.yml`; `auditConfig.ignoreGhsas`  |
| A new advisory nobody is pushing past         | The same audit runs every morning on `main` and opens an issue                                                                                              | `security-audit.yml`                                 |
| A vulnerable transitive dependency            | A pnpm override lifts only the vulnerable range, the advisory named beside it                                                                               | `overrides` in `pnpm-workspace.yaml`                 |

**CI and GitHub**

| Risk                                           | Defence                                                                                                                                                                | Where                                               |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| A moved or hijacked Action tag                 | Every Action is pinned to a commit SHA, the version in a comment; Renovate keeps it that way                                                                           | `.github/workflows/*.yml`, `renovate.json`          |
| An unsafe workflow                             | zizmor lints every workflow in CI: injection, over-broad permissions, known-bad Actions                                                                                | `ci.yml`                                            |
| A later step reading the GitHub token          | `actions/checkout` runs with `persist-credentials: false`                                                                                                              | every workflow                                      |
| A workflow with more power than it needs       | The default token is read-only; each workflow asks only for what it uses (`contents: read`, plus `issues: write` for the daily audit); none uses `pull_request_target` | repository settings, each workflow's `permissions:` |
| A bot's PR changing CI or the dependency rules | The owner is asked to review any change to `.github/`, `pnpm-workspace.yaml`, `renovate.json`, `.coderabbit.yaml` and `AGENTS.md`                                      | `.github/CODEOWNERS`                                |

**Secrets**

| Risk                            | Defence                                                                                                    | Where                                                |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| A committed secret              | Secret scanning and push protection are on                                                                 | repository settings                                  |
| A secret in a public repository | Placeholders only in CI; real values live in GitHub, Cloudflare or Vercel as secrets, entered by the owner | [AGENTS.md](../AGENTS.md) (Environments and secrets) |

The repository settings in these tables were checked through the GitHub API
on 25 October 2026. `main` requires a PR and the "Lint, typecheck, build"
check, so the audit and zizmor steps gate every merge to it.

## When a security fix comes out

1. **Is it ours?** `pnpm why -r <package>` shows whether it's in the tree, and
   through what. A package that runs on a server for shoppers (Next.js, the
   API Worker's dependencies) is urgent; build tooling can follow the normal
   process.
2. **Mitigate while you check.** If a fix can't be installed straight away,
   turn off the affected feature or block the attack at the edge (a Vercel
   firewall rule), and say so in the PR.
3. **Install it at once if it passes all four checks** (the fast track in
   AGENTS.md):
   - a GitHub-reviewed advisory names this exact version as patched;
   - it's a patch or minor release from the same publisher as the version it
     replaces;
   - pnpm's trust policy passes;
   - CI passes.

   `pnpm audit --fix` adds the version to `minimumReleaseAgeExclude`, and a
   Renovate security PR may arrive with the line already written. Either way,
   keep it only if all four hold, with a comment naming the advisory, and take
   it out once the version is 7 days old. The reviewer of the PR is the gate:
   CI can't check the first two conditions, and nothing in this repository
   merges automatically.

   If the first or second check fails, the version isn't fast-tracked and
   waits the normal 7 days. If the trust policy or CI fails, stop and
   investigate: waiting won't change either, and a trust failure on a
   "security fix" can be the attack itself.

4. **Production first.** Production deploys from `main`, so a fix for
   something live goes to `main` as its own PR (as #153 did), not only onto
   whatever branch is in progress.
5. **Record it** below, with what affected us and what didn't.

**Why there's no wait for a verified fix.** The wait exists to keep out a
malicious version dressed up as a fix. The checks above catch that directly:
an attacker can't get a version named in a reviewed advisory, and a release
from a stolen token fails the trust policy. Meanwhile exploits for critical
flaws now appear within hours of the advisory, so a fixed delay costs more
than it saves.

## Accepted findings

These have no usable fix. Each is in `auditConfig.ignoreGhsas` with a review
date, so CI ignores exactly these and fails on anything new. pnpm counts them
as production dependencies because the app depends on `expo`; most of the code
only runs in Expo's command-line tools.

| Advisory            | Package                    | Severity | Path                                 | Why it's acceptable                                                                                                  | Review      |
| ------------------- | -------------------------- | -------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------- | ----------- |
| GHSA-86w9-cpqp-85rv | node-forge 1.4.0           | High     | Expo CLI's code-signing certificates | No patched release exists. Used only when signing Expo updates locally, which this project doesn't do.               | 25 Nov 2026 |
| GHSA-mrhx-c7xc-m3w5 | zod 3.25.76                | High     | Expo CLI                             | The fix is in zod 4 only; Expo CLI needs 3. Memory exhaustion on oversized input to the CLI's own config validation. | 25 Nov 2026 |
| GHSA-w5hq-g745-h8pq | uuid 7.0.3                 | Moderate | Expo's `xcode` package (prebuild)    | The fix needs uuid 11. The bug needs a caller-supplied buffer, which `xcode` doesn't pass.                           | 25 Nov 2026 |
| GHSA-vcc3-ghjq-m6fr | decode-uri-component 0.2.2 | Moderate | expo-router's query-string           | No 0.2 or 0.4 fix exists. A slow decode of a malformed URL, in the shopper's own app.                                | 25 Nov 2026 |

Each comes out of the list once Expo updates the parent package with the fix.
On the review date, check for one; if there's still none, move the date on.

**Trust-policy exceptions.** Four exact versions in the lockfile fail
`trustPolicy` without being suspicious, and are listed in
`trustPolicyExclude`: semver 6.3.1, ua-parser-js 1.0.41, undici-types 6.21.0
and eslint-import-resolver-typescript 3.10.1. Each is a release on an older
major line, published by the package's long-standing maintainer without
provenance, after the newer line had started publishing with it. Checked by
hand on 25 October 2026. Any other version of those packages is still checked.

## Still to switch on (repository owner)

- **Dependabot alerts.** They're off, so nothing told us about the Next.js
  flaw for eleven days. Settings → Advanced Security → Dependabot alerts.
  Leave Dependabot security and version updates off: Renovate opens the PRs.
- **Renovate.** Install the app on this repository only. It reads
  `renovate.json` from `main`, so it starts once the batch has merged.
- **More secret scanning.** Settings → Advanced Security: turn on
  "non-provider patterns" (generic secrets such as private keys and
  connection strings) and "validity checks" (whether a leaked token still
  works). Both are off.
- **Actions policy.** Settings → Actions → General: allow only GitHub's own
  Actions, verified creators and the ones listed (pnpm/action-setup,
  shopify/lighthouse-ci-action), and tick "Require actions to be pinned to a
  full-length commit SHA".
- **Environments for CI secrets.** The e2e and Lighthouse workflows read
  repository-wide secrets (zizmor's `secrets-outside-env`). Moving them into a
  GitHub environment limited to `main` and PR branches means a workflow on any
  other branch can't read them.
- **Tokens.** Review personal access tokens on GitHub, npm and Expo and remove
  any that aren't needed. GhostAction spread through long-lived classic tokens.
- **Tailscale** to 1.104.2 or later on every device (forged certificates from
  the distrusted eMudhra intermediates). Done on the laptop, phone and
  droplet (26 October 2026).

**Off on purpose:** "Require review from Code Owners". The owner is the only
maintainer, and GitHub doesn't let authors approve their own PRs, so it would
block every merge. Turn it on when there's a second maintainer.

## The running sites

**Web (Vercel)**

| Risk                                      | Defence                                                                                                                                   | Where                                   |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| A script loaded from somewhere unexpected | A Content Security Policy lists every host the site loads from. **Report-only for now** (below)                                           | `apps/web/lib/security-headers.ts`      |
| Another site framing ours (clickjacking)  | `X-Frame-Options: DENY`                                                                                                                   | the same file                           |
| A downgrade to plain HTTP                 | `Strict-Transport-Security` for two years, without `preload` until the real domain is bought                                              | the same file                           |
| A response read as the wrong type         | `X-Content-Type-Options: nosniff`                                                                                                         | the same file                           |
| Full URLs leaking to other sites          | `Referrer-Policy: strict-origin-when-cross-origin`                                                                                        | the same file                           |
| Device features nobody asked for          | `Permissions-Policy` turns off camera, microphone, location and USB                                                                       | the same file                           |
| The image optimiser fetching on request   | No `images` setting, so `/_next/image` fetches nothing remote. Every image comes straight from Shopify's CDN through Hydrogen's `<Image>` | `apps/web/next.config.ts`               |
| A header or policy quietly dropped        | e2e tests check the headers, and fail on any policy violation on the main pages, with and without tracking accepted                       | `apps/web/e2e/security-headers.spec.ts` |

**The Content Security Policy, and when it starts blocking.** It's sent as
`Content-Security-Policy-Report-Only`, so browsers report what it would block
without blocking anything. The batch still has PRs that add third parties
(PostHog, Sentry, ad tags); each adds its hosts to the policy, and the e2e test
says when one is missing. Once those have merged and the test has stayed
clean, switch the header to `Content-Security-Policy`. `script-src` allows
`'unsafe-inline'` because Next's App Router inlines its hydration data;
per-request nonces would make every page dynamic and undo the cached
catalogue. So the policy limits where scripts come from, not inline
injection, which React's escaping covers.

**API (Cloudflare Worker)**

| Risk                                       | Defence                                                                                                                                        | Where                                        |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Someone borrowing the Worker's Klaviyo key | Only an email is read from the request; the Worker builds the Klaviyo payload itself, with its own list. No CORS, so other sites can't call it | `apps/api/src/index.ts`                      |
| Flooding the sign-up endpoint              | 5 requests a minute per IP (Cloudflare's own `CF-Connecting-IP`, which a caller can't fake), checked before the body is read                   | `apps/api/src/rate-limiter.ts`, `-policy.ts` |
| A large or malformed body                  | Only `POST` with JSON, at most 1 KB                                                                                                            | `apps/api/src/index.ts`                      |
| Upstream errors describing the account     | Callers only ever see `invalid-email`, `rate-limited` or `rejected`; Klaviyo's message is logged, without the address                          | `apps/api/src/index.ts`                      |

The per-IP limit lives in a Durable Object, so every request still reaches
the Worker and is billed. A flood from many addresses would get through it.
**To switch on (owner):** a Cloudflare rate-limiting rule in front of the
Worker (Security → WAF → Rate limiting rules; the free plan includes one),
for example 20 requests per 10 seconds per IP on the Worker's hostname, with
the action "Block". It stops a flood before the Worker runs.

## If something goes wrong

Do the first step straight away; the rest can follow.

**The site is serving something it shouldn't** (a bad deploy, defaced pages,
an unknown script):

1. **Roll back.** Vercel → the project → Deployments → the last good one →
   Instant Rollback. The Worker: `pnpm --filter @formulate/api exec wrangler
rollback`. The theme: Online Store → Themes → publish the previous copy.
2. **Find the cause** before redeploying: the commits since the good
   deployment, the lockfile diff, and the Vercel and Worker logs.

**A secret has leaked** (in a commit, a log, a screenshot, a chat):

1. **Revoke it first**, then replace it. Deleting the commit doesn't help: a
   public repository is copied within minutes.

   | Secret                               | Revoke and replace in                                           | Then update                                     |
   | ------------------------------------ | --------------------------------------------------------------- | ----------------------------------------------- |
   | Shopify Storefront tokens (web, app) | Shopify admin → Headless channel → storefront → tokens          | Vercel env vars; EAS env vars, then a new build |
   | Shopify Admin API token              | Shopify admin → Apps → develop apps → the app → API credentials | wherever the owner uses it                      |
   | Theme Access password, shop password | Shopify admin → Theme Access app; Online Store → Preferences    | GitHub Actions secrets                          |
   | Klaviyo private key                  | Klaviyo → Settings → API keys                                   | `wrangler secret put KLAVIYO_PRIVATE_KEY`       |
   | Judge.me private token               | Judge.me → Settings → Integrations                              | `wrangler secret put JUDGEME_PRIVATE_TOKEN`     |
   | Recharge API token                   | Recharge → Apps & integrations → API tokens                     | the owner's local config                        |
   | Vercel deployment-protection bypass  | Vercel → project → Settings → Deployment Protection             | GitHub Actions secret                           |
   | GitHub, npm, Expo, Cloudflare tokens | each account's token settings                                   | wherever it was used                            |

2. **Check what it was used for:** the service's own logs (Shopify's audit
   log, Klaviyo's API key activity, Cloudflare's audit log).

**A dependency turns out to be malicious** (an npm worm, a hijacked release):

1. If it ran in CI or on a laptop, treat every secret that machine could read
   as leaked (above), starting with GitHub and npm tokens.
2. Remove it: pin the last good version with a pnpm override, and follow
   "When a security fix comes out".
3. Look for what these worms leave behind: new workflows on any branch,
   commits under unknown names, new GitHub tokens or SSH keys on the account.

**Who to tell**

- **Customers' personal data exposed** (names, emails, addresses, orders):
  in the UK, the ICO within 72 hours of finding out, unless it's unlikely to
  put anyone at risk (UK GDPR, Article 33); and the people affected, if the
  risk to them is high (Article 34). Write down what happened and what was
  done either way.
- **A Shopify or Klaviyo account compromised:** their support, as well as
  rotating the keys.
- While this is a demo store with no real customers, the record is the main
  thing: what happened, when, and what was rotated.

## October 2026 audit (25 Oct)

October was a heavy month: worms republishing npm packages from stolen tokens
(SubQuery, Tensorlake, the Shai-Hulud variants), stolen GitHub tokens pushing
credential-stealing workflows (GhostAction), and critical fixes in Next.js and
Node.js.

**What affected us**

- **Next.js 16.3.8 → 16.4.2.** Two critical unauthenticated remote code
  execution flaws (`use cache` returning typed arrays, GHSA-673q-mjm6-r5xr; the
  Image Optimization API with SVGs, GHSA-2464-fhr4-w9xw) and a high-severity
  Server Actions denial of service (GHSA-p3m5-59mp-jv5r). Fixed in 16.4.1;
  16.4.2 adds only bug fixes and is past the 7-day rule. The web app is the
  only surface that runs Next.js on a server, so this was the one live risk.
- **Node.js 22.23.2 → 22.23.4** on the development droplet (Brotli decoder
  remote code execution, CVE-2026-111497, and nine others). CI asks for
  `node-version: 22`, so it already gets the patched release; Vercel patches
  its managed runtime itself.
- **Transitive dependencies:** `pnpm audit` went from 74 findings (3 critical,
  45 high) to 4 (2 high, 2 moderate). Vitest moved to 4.1.12; everything else
  is an override. All of it is build or development tooling (Expo CLI,
  Wrangler's local simulator, ESLint, GraphQL codegen), not code that ships.

**What didn't affect us**

- None of the packages named in this month's npm compromises is in the
  lockfile (checked: the keyv/cacheable family, node-ipc, `@subql/*`,
  tensorlake). keyv, flat-cache and file-entry-cache are present, at older,
  clean versions.
- No indicators of compromise in the repository or on the droplet: no
  `security-audit` style workflows on any branch, no commits from the worm's
  author identity, no `setup.mjs` preinstall hooks in `node_modules`, no
  `/tmp/nt-*` staging directories. The Claude Code hooks on the droplet are
  Moshi's and herdr's.
