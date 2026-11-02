"use client";

import { campaignCountdown, type CountdownWindow } from "@formulate/shopify";
import { useEffect, useState } from "react";

/**
 * The campaign's end, counting down within its countdown window (SHO-169,
 * SHO-201; the last day unless the record says otherwise): "Ends in 5h 12m",
 * from the real end time, so it can't drift from the offer. Before the
 * window it's the date label the server rendered ("Ends 23:59 Mon 30 Nov").
 *
 * `now` is the server's clock at render, for the first paint. After that the
 * browser's clock takes over, unless `clockPreview` says `now` was a preview
 * time: then the client keeps the offset, so a preview counts down too.
 * Without a preview the offset would only be the page's age (a cached page,
 * a slow hydration), and the countdown would run behind the real end.
 * Updates every 30 seconds; minutes are all it shows.
 */
export const CampaignEnds = ({
  endsAt,
  label,
  now,
  clockPreview = false,
  countdown = "24h",
}: {
  readonly endsAt: string;
  readonly label: string;
  readonly now: number;
  readonly clockPreview?: boolean;
  readonly countdown?: CountdownWindow;
}) => {
  const [text, setText] = useState(
    () => campaignCountdown(new Date(endsAt), new Date(now), countdown) ?? label,
  );
  useEffect(() => {
    const offset = clockPreview ? now - Date.now() : 0;
    const update = () =>
      setText(
        campaignCountdown(new Date(endsAt), new Date(Date.now() + offset), countdown) ??
          label,
      );
    update();
    const timer = setInterval(update, 30_000);
    return () => clearInterval(timer);
  }, [endsAt, label, now, clockPreview, countdown]);
  // Not a live region: a screen reader announcing every minute is noise.
  return <span className="whitespace-nowrap">{text}</span>;
};
