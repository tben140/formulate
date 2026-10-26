# Security

How this repository keeps its dependencies and CI safe, and the record of each
audit. The dependency age rule itself is in [AGENTS.md](../AGENTS.md)
(Dependencies).

## The defences

| Risk                                     | Defence                                                                                                          | Where                                               |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| A hijacked npm release                   | Nothing younger than 7 days is installed (2 days for a security fix)                                             | `minimumReleaseAge` in `pnpm-workspace.yaml`        |
| Install-time malware                     | pnpm runs dependency install scripts only for allowlisted packages                                               | `allowBuilds` in `pnpm-workspace.yaml`              |
| A known vulnerability                    | CI fails on any **critical** advisory                                                                            | `pnpm audit --audit-level critical` in `ci.yml`     |
| A vulnerable transitive dependency       | A pnpm override lifts only the vulnerable range, with the advisory named beside it                               | `overrides` in `pnpm-workspace.yaml`                |
| A moved or hijacked Action tag           | Every Action is pinned to a commit SHA, the version in a comment                                                 | `.github/workflows/*.yml`                           |
| A later step reading the GitHub token    | `actions/checkout` runs with `persist-credentials: false`                                                        | every workflow                                      |
| A workflow with more power than it needs | The default token is read-only and each workflow asks only for `contents: read`; none uses `pull_request_target` | repository settings, each workflow's `permissions:` |
| A committed secret                       | Secret scanning and push protection are on                                                                       | repository settings                                 |

The repository settings in this table were checked through the GitHub API on 25 October 2026.

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

**Accepted for now, no fix released**

| Package                    | Severity | Path                                 | Why it's acceptable                                                                                                  |
| -------------------------- | -------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| node-forge 1.4.0           | High     | Expo CLI's code-signing certificates | No patched release exists. Used only when signing Expo updates locally, which this project doesn't do.               |
| zod 3.25.76                | High     | Expo CLI                             | The fix is in zod 4 only; Expo CLI needs 3. Memory exhaustion on oversized input to the CLI's own config validation. |
| uuid 7.0.3                 | Moderate | Expo's `xcode` package (prebuild)    | The fix needs uuid 11. The bug needs a caller-supplied buffer, which `xcode` doesn't pass.                           |
| decode-uri-component 0.2.2 | Moderate | expo-router's query-string           | No 0.2 or 0.4 fix exists. A slow decode of a malformed URL in the shopper's own app.                                 |

Each finding goes away once Expo updates the parent package with the fix. `pnpm audit` lists them.

## Still to switch on (repository owner)

- **Dependabot alerts.** They're off, so nothing told us about the Next.js
  flaw for eleven days. Settings → Advanced Security → Dependabot alerts.
- **Renovate.** `renovate.json` exists but has never run: the Renovate app
  isn't installed, and the file isn't on `main` yet.
- **Actions policy.** Settings → Actions → General: allow only GitHub's own
  Actions, verified creators and the ones listed (pnpm/action-setup,
  shopify/lighthouse-ci-action), and tick "Require actions to be pinned to a
  full-length commit SHA".
- **Tokens.** Review personal access tokens on GitHub, npm and Expo and remove
  any that aren't needed. GhostAction spread through long-lived classic tokens.
- **Tailscale** to 1.104.2 or later on every device (forged certificates from
  the distrusted eMudhra intermediates). The droplet runs 1.102.4.
