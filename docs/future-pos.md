# Future: POS extension

> **Out of scope.** Nothing here is being built. Kept because a fourth surface is
> the obvious next thing someone asks about, and the reasons not to build it now
> are worth having written down.

## What it would be

A Shopify POS UI extension: a small piece of interface running inside the POS app
on a staff device in a physical shop.

The premise that makes it interesting is **the same customer, two contexts**.
Someone who subscribes online walks into the shop; the staff member should be
able to see that. Nothing else in this project spans the online/offline boundary.

## Realistic scope, if it were built

**Purpose:** let staff look up a customer and see their online state — recent
orders, active Recharge subscriptions, next charge date. Lookup, not management.

**Surface:** the customer detail target in POS, which is where a staff member
already is when a customer is standing in front of them. A home-screen tile would
be a second place to remember, for no gain.

**Reads:** customer, orders, Recharge subscriptions — the same
[domain model](domain-model.md) the storefronts use.

**Writes:** nothing, initially. Writing from POS means reconciling with an online
system that is also writing, and that is a genuinely hard problem rather than an
incidental one.

## The constraints that shape it

**Offline behaviour.** POS is used in shops with unreliable connectivity, and the
POS app itself is built to keep selling when the network drops. An extension that
reads a third-party API has no such guarantee. Any subscription lookup must
degrade to "cannot check right now" rather than to a blank panel that reads as
"no subscriptions" — which is worse than useless, because it is confidently
wrong.

**Permissions.** Staff permissions in POS are not the same as admin permissions.
An extension showing subscription and billing detail is showing customer
financial data to a shop assistant, which is a decision rather than a default.

**Device limits.** POS extensions run in a constrained environment with a small
viewport and a restricted component set. It is not a web view where arbitrary UI
can be dropped in.

**A second Recharge session.** As with the customer portal, Recharge's data needs
a Recharge credential. In POS that credential belongs to the shop rather than the
customer, which is a different authorisation model again — see
[Recharge](integration-recharge.md).

## Why it is out of scope

Three reasons, in order of weight:

1. **It cannot be demonstrated by a link.** Every other surface in this project
   can be handed to someone as a URL or a build. A POS extension needs the POS
   app, a location, and staff credentials. For an artefact whose purpose is to be
   looked at, that is close to disqualifying.
2. **It depends on things not yet built.** Customer accounts and the Recharge
   read path both have to exist first. Built now, it would read data that does
   not exist yet.
3. **It duplicates the proof.** "Can read Recharge data across a system
   boundary" is already demonstrated by the web portal, more cheaply and more
   visibly.

None of these say the idea is bad — they say it is fourth in line.

## Related

- [Domain model](domain-model.md) · [Recharge](integration-recharge.md) · [B2B vs blended](future-b2b.md)
