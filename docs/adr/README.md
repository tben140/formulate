# Architecture decision records

One file per decision that would be expensive or confusing to reverse. Each
records the situation at the time, the choice made, the alternatives rejected,
and what the choice costs.

## Why these live in the repository

Because reasoning kept away from code stops being read, and then stops being
true. A constraint recorded only in a ticket or a chat log looks arbitrary by the
time someone meets it, and arbitrary-looking constraints get removed — by people
and, increasingly, by coding agents refactoring code whose reasoning they cannot
see.

Several of the records below exist precisely because the constraint looks like a
mistake from the outside. A version pin with no explanation is indistinguishable
from neglect.

## The records

| #                                                       | Decision                             | Status   | Date       |
| ------------------------------------------------------- | ------------------------------------ | -------- | ---------- |
| [0001](0001-monorepo-over-separate-theme-repository.md) | Monorepo, including the Liquid theme | Accepted | 2026-08-05 |
| [0002](0002-typescript-6-over-7.md)                     | TypeScript `~6.0.3`, not 7           | Accepted | 2026-07-26 |
| [0003](0003-nativewind-v5-and-tailwind-v4.md)           | NativeWind v5 preview + Tailwind v4  | Accepted | 2026-07-26 |
| [0004](0004-pin-lightningcss-to-1-30-1.md)              | Pin `lightningcss` to 1.30.1         | Accepted | 2026-07-26 |
| [0005](0005-parity-means-design-not-data.md)            | Parity means design, not data        | Accepted | 2026-08-05 |
| [0006](0006-checkout-handoff-differs-per-surface.md)    | Checkout handoff differs per surface | Accepted | 2026-07-26 |

## Writing a new one

Copy [`0000-template.md`](0000-template.md), take the next number, and **commit
it in the same pull request as the change it explains**. A record written later
is a reconstruction, and reconstructions quietly omit the alternatives that
seemed reasonable at the time — which is the most useful part.

Records are immutable once merged. If a decision changes, write a new record and
mark the old one `Superseded by ADR-NNNN`.

Not everything needs one. The test: _would someone reasonably assume this was a
mistake?_ If yes, write it down.

## Related

- [Docs index](../README.md) · [Architecture](../architecture.md)
