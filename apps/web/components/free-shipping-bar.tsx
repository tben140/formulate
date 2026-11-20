import {
  freeShippingMessage,
  freeShippingProgress,
  type MoneyLike,
} from "@formulate/shopify";
import { useEffect, useState } from "react";

/**
 * How far the cart is from free standard delivery.
 *
 * The status element stays mounted even when there is nothing to say, empty
 * cart included. A live region is only reliably announced when its *text*
 * changes; one that appears already filled in is often skipped. So the region
 * is always there, and only its contents come and go.
 *
 * A change made while the drawer is closed (a product-page add updates the
 * cart, then opens it) would land in a hidden region and go unsaid. So the
 * region keeps its last text while `open` is false, and takes the new one a
 * frame after the drawer opens, once it's in the accessibility tree. While
 * open, a change shows on the next frame.
 *
 * The bar is decoration and hidden from assistive tech. The sentence carries
 * the information, so nothing depends on seeing the colour or the width.
 */
export const FreeShippingBar = ({
  subtotal,
  open,
}: {
  subtotal: MoneyLike | null;
  open: boolean;
}) => {
  const progress = subtotal ? freeShippingProgress(subtotal) : null;
  const message = progress ? freeShippingMessage(progress) : "";

  const [spoken, setSpoken] = useState(message);
  useEffect(() => {
    if (!open || spoken === message) return;
    const frame = requestAnimationFrame(() => setSpoken(message));
    return () => cancelAnimationFrame(frame);
  }, [open, message, spoken]);

  return (
    <div className={progress ? "border-b border-border px-4 py-3" : undefined}>
      <p role="status" className="text-sm">
        {spoken || null}
      </p>

      {progress ? (
        <div aria-hidden className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink-100">
          <div
            className={`h-full rounded-full transition-[width] duration-300 motion-reduce:transition-none ${
              progress.kind === "unlocked" ? "bg-success" : "bg-brand-600"
            }`}
            style={{ width: `${Math.floor(progress.fraction * 100)}%` }}
          />
        </div>
      ) : null}
    </div>
  );
};
