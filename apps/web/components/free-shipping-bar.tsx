import {
  freeShippingMessage,
  freeShippingProgress,
  type MoneyLike,
} from "@formulate/shopify";

/**
 * How far the cart is from free standard delivery.
 *
 * The status element stays mounted even when there is nothing to say, empty
 * cart included. A live region is only reliably announced when its *text*
 * changes; one that appears already filled in is often skipped. So the region
 * is always there, and only its contents come and go.
 *
 * The bar is decoration and hidden from assistive tech. The sentence carries
 * the information, so nothing depends on seeing the colour or the width.
 */
export const FreeShippingBar = ({ subtotal }: { subtotal: MoneyLike | null }) => {
  const progress = subtotal ? freeShippingProgress(subtotal) : null;

  return (
    <div className={progress ? "border-b border-border px-4 py-3" : undefined}>
      <p role="status" className="text-sm">
        {progress ? freeShippingMessage(progress) : null}
      </p>

      {progress ? (
        <div aria-hidden className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink-100">
          <div
            className={`h-full rounded-full transition-[width] duration-300 motion-reduce:transition-none ${
              progress.kind === "unlocked" ? "bg-success" : "bg-brand-600"
            }`}
            style={{ width: `${Math.round(progress.fraction * 100)}%` }}
          />
        </div>
      ) : null}
    </div>
  );
};
