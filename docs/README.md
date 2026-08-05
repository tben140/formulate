# Formulate — project docs

Architecture, domain notes and decision records for a Shopify storefront built
three ways over one data and design layer.

This folder is also an [Obsidian](https://obsidian.md) vault. Open `docs/` as a
vault to browse it as a graph; it is plain markdown either way.

> **Links must be standard markdown, not `[[wikilinks]]`.**
> GitHub renders `[[Domain model]]` as literal text. In Obsidian, turn wikilinks
> off under **Settings → Files & Links → Use [[Wikilinks]]**.

## Start here

| Note                              | What it covers                                                                             |
| --------------------------------- | ------------------------------------------------------------------------------------------ |
| [Architecture](architecture.md)   | The three surfaces, what they share, and where they deliberately diverge                   |
| [Domain model](domain-model.md)   | Customer, product, cart, order, subscription — and where Shopify's shape and ours disagree |
| [Decision records](adr/README.md) | Why things are the way they are, with alternatives                                         |

## Surfaces

| Note                             | Surface                                                            |
| -------------------------------- | ------------------------------------------------------------------ |
| [Web storefront](surface-web.md) | `apps/web` — Next.js 16, React Server Components, Vercel           |
| [Mobile app](surface-mobile.md)  | `apps/mobile` — Expo SDK 57, TanStack Query, Checkout Sheet Kit    |
| [Liquid theme](surface-theme.md) | `apps/theme` — Shopify Online Store, web components, no build step |

## Integrations

| Note                                | Status                                                      |
| ----------------------------------- | ----------------------------------------------------------- |
| [Recharge](integration-recharge.md) | Installed; one live test subscription. Portal not yet built |
| [Klaviyo](integration-klaviyo.md)   | Planned. Design only — nothing shipped                      |

## Out of scope, kept for reference

These describe work that is explicitly **not** being built in the current push.
They exist because the reasoning is worth keeping, not because they are queued.

- [B2B vs blended](future-b2b.md)
- [POS extension](future-pos.md)

## What lives where

Three homes, and a fact never lives in two of them.

|                           | Holds                                                            | Public                        |
| ------------------------- | ---------------------------------------------------------------- | ----------------------------- |
| **`docs/` (this folder)** | Architecture, domain model, decision records, integration design | Yes — part of the deliverable |
| **Linear**                | Execution: what is being built, by when, in what order           | No                            |
| **Personal vault**        | Career notes, target employers, applications                     | No — outside this repository  |

The practical rule: **`docs/` answers "why is it like this?", Linear answers
"what is happening now?"** Sprint state and ticket status are deliberately
absent here, because a markdown file cannot stay honest about them.

Instructions aimed at coding agents live in [`AGENTS.md`](../AGENTS.md) at the
repository root, and in a per-app `AGENTS.md` beside each surface.
