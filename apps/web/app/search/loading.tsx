/**
 * SHO-150 spike: the Suspense boundary every page streams into, so the layout
 * (header, nav, footer) is a prerendered shell and per-request pages arrive
 * behind it. Pages whose data is all cached prerender in full and never show
 * this.
 */
const Loading = () => (
  <p role="status" className="py-8 text-foreground-muted">
    Loading…
  </p>
);

export { Loading as default };
