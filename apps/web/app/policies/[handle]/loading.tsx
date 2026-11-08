/**
 * The Suspense boundary a policy page streams into (Cache Components). Tall,
 * like the policy text, so the footer doesn't jump when it arrives.
 */
const Loading = () => (
  <div role="status" aria-label="Loading" className="min-h-[70vh]">
    <div className="h-9 w-64 rounded-md bg-surface-muted" />
    <div className="mt-6 space-y-3">
      {Array.from({ length: 8 }, (_, index) => (
        <div key={index} className="h-4 w-full rounded bg-surface-muted" />
      ))}
    </div>
  </div>
);

export { Loading as default };
