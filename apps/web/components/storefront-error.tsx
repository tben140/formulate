import { describeError, type StorefrontError } from "@formulate/shopify";

/**
 * Renders a Storefront failure without pretending it didn't happen.
 *
 * The `config` and `http` cases are overwhelmingly the ones a developer hits
 * first (no .env.local, or products not published to the token's sales
 * channel), so those get an explicit next step rather than a generic apology.
 */
export const StorefrontErrorState = ({ error }: { error: StorefrontError }) => (
  <div
    role="alert"
    className="rounded-lg border border-danger/30 bg-danger/5 p-6 text-sm"
  >
    <h2 className="mb-2 text-base font-semibold text-danger">
      Could not load from Shopify
    </h2>
    <p className="mb-3 text-foreground-muted">{describeError(error)}</p>

    {error.kind === "config" ? (
      <p className="text-foreground-muted">
        Copy <code className="font-mono">.env.example</code> to{" "}
        <code className="font-mono">apps/web/.env.local</code> and fill in the
        Storefront token.
      </p>
    ) : null}

    {error.kind === "http" && (error.status === 401 || error.status === 403) ? (
      <p className="text-foreground-muted">
        The token was rejected. Check it is a Storefront (not Admin) access
        token and that it belongs to this store.
      </p>
    ) : null}
  </div>
);
