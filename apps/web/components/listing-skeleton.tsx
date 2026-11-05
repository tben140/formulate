/**
 * The placeholder a product listing streams into (collections, search).
 *
 * Shaped like the real page, a heading then a grid of product cards, so the
 * footer starts roughly where it ends up. A one-line "Loading…" let the
 * listing push the footer down when it arrived: Lighthouse measured a layout
 * shift of 0.39 on the collection page (budget 0.05).
 */
export const ListingSkeleton = ({ cards = 6 }: { readonly cards?: number }) => (
  <div role="status" aria-label="Loading products">
    <div className="h-9 w-48 rounded-md bg-surface-muted" />
    <div className="mt-3 h-5 w-full max-w-md rounded-md bg-surface-muted" />
    <ul
      className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3"
      aria-hidden="true"
    >
      {Array.from({ length: cards }, (_, index) => (
        <li key={index} className="rounded-lg border border-border p-3">
          <div className="mb-3 aspect-square rounded-md bg-surface-muted" />
          <div className="h-5 w-3/4 rounded bg-surface-muted" />
          <div className="mt-2 h-4 w-1/3 rounded bg-surface-muted" />
        </li>
      ))}
    </ul>
  </div>
);
