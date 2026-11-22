# The storefront for AI agents

Shoppers increasingly arrive through an AI agent: an assistant that searches,
compares and fills a cart for them, in the browser or on a server. Shopify's
Fall '26 Editions made agents first-class: every store has a Universal Commerce
Protocol (UCP) endpoint, and checkout registers WebMCP tools in the browser.
This is how each surface meets them.

|                                        | Theme                               | Web                                            | App      |
| -------------------------------------- | ----------------------------------- | ---------------------------------------------- | -------- |
| UCP (search, cart, checkout, over MCP) | Shopify, at the store's domain      | `/.well-known/ucp` proxies the store's profile | n/a      |
| WebMCP tools in the browser            | Shopify's storefront and cart tools | Ours: `components/agent-tools.tsx`             | n/a      |
| Readable catalogue                     | Shopify's                           | `/llms.txt`, and pages as Markdown             | n/a      |
| Checkout                               | Shopify's, with Checkout WebMCP     | the same                                       | the same |

## Web

- **`/llms.txt`** says what the store is, lists the collections and policies,
  and points to UCP for buying. Every document opens with the demo-store
  notice: an agent must never tell someone they can buy here for real.
- **Markdown pages:** `/products/<handle>.md`, `/collections/<handle>.md` and
  `/search.md?q=…`, or the normal page URL with `Accept: text/markdown`
  (rewrites in `next.config.ts`, documents in `lib/agents.ts`). Products list
  each variant and subscription plan with its price, stock and the ids an
  agent needs to add it to a cart. Cached for an hour at the CDN.
- **`/.well-known/ucp`** is the store's own UCP profile, which Shopify serves
  for every store. Its MCP endpoint (`search_catalog`, `create_cart`,
  `create_checkout`, `complete_checkout`, `ask_business` and more) stays on the
  store's domain; nothing on Vercel handles it.
- **WebMCP** (`components/agent-tools.tsx`): `search_products`, `get_product`,
  `add_to_cart` and `open_cart`, registered with `document.modelContext` when
  the browser has it (a W3C draft, behind a flag or origin trial in Chrome).
  `add_to_cart` uses the same server action as the Add to cart button, so the
  same rules apply (quantity cap, sold-out handling), and the shopper sees the
  cart open. Checkout is Shopify's, whose own WebMCP tools ask the shopper to
  confirm before an order is placed.

**Checked (2026-10-28, local production build):** every route returns Markdown
or the UCP profile; an unknown product is a Markdown 404; HTML pages are
unchanged. The four WebMCP tools, called through a stand-in
`document.modelContext`, searched, returned a product's variant and plan ids,
added a subscription to the cart and opened the drawer, and refused an unknown
variant with the shopper-facing message. The storefront, cart and footer e2e
specs pass (24).

## Not done

- **Shopify's business knowledge base** (Settings, Editions Fall '26): the
  facts, policies and FAQs Shopify's `ask_business` answers from. Admin
  content, for the store owner.
- **Agent sign-in** (Shop sign-in, granular consent scopes) and **Web Bot
  Auth** apply to agents themselves, not to the store.
- **The app** has no agent surface; agents use the web or UCP.
