# Slide-in cart for Liquid themes

> Draft (SHO-119). Rewrite in your own words.

**For:** a Shopify store whose cart page sends shoppers away from the product
they were looking at.

**What it does:** Add to cart opens a drawer over the page with the line, the
quantity controls, a free-delivery progress bar and product suggestions. The
shopper keeps their place; checkout is one press away.

**Why it's better than most:** it's built on the browser's own `<dialog>`
element, so the parts drawers usually get wrong come for free and correct:

- focus moves into the drawer and stays there, and goes back to the button
  that opened it when it closes;
- Escape closes it;
- the page behind becomes inert, so a screen reader can't wander into content
  the eye can't see;
- the backdrop is a real `::backdrop`, not a div pretending to be one.

**Proof:**

- The same drawer on the Liquid theme and the headless storefront
  (`apps/web/components/cart-drawer.tsx`), checked by keyboard in automated
  end-to-end tests on every change.
- Changes show at once and undo themselves with a message if the store
  refuses (#181).
- Something that went wrong: making the drawer's heading focusable for one
  feature made it the first focus on _every_ add to cart. The keyboard test
  caught it before it shipped.

**Recording to make:** add to cart from a product page, change the quantity,
close with Escape (keyboard visible on screen), focus returns to Add to cart.
