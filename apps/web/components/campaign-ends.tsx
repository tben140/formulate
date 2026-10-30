"use client";

import { campaignCountdown } from "@formulate/shopify";
import { useEffect, useState } from "react";

/**
 * The campaign's end, counting down in its last day (SHO-169): "Ends in 5h
 * 12m", from the real end time, so it can't drift from the offer. Before the
 * last day it's the date label the server rendered ("Ends 23:59 Mon 30 Nov").
 *
 * `now` is the server's clock at render, which a preview time may have moved;
 * the client keeps the same offset, so a preview counts down too. Updates
 * every 30 seconds; minutes are all it shows.
 */
export const CampaignEnds = ({
  endsAt,
  label,
  now,
}: {
  readonly endsAt: string;
  readonly label: string;
  readonly now: number;
}) => {
  const [text, setText] = useState(
    () => campaignCountdown(new Date(endsAt), new Date(now)) ?? label,
  );
  useEffect(() => {
    const offset = now - Date.now();
    const update = () =>
      setText(
        campaignCountdown(new Date(endsAt), new Date(Date.now() + offset)) ?? label,
      );
    const timer = setInterval(update, 30_000);
    return () => clearInterval(timer);
  }, [endsAt, label, now]);
  // Not a live region: a screen reader announcing every minute is noise.
  return <span className="whitespace-nowrap">{text}</span>;
};
