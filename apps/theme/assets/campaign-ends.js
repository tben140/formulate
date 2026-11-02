/**
 * A campaign's end, counting down within its countdown window (SHO-169,
 * SHO-201): "Ends in 5h 12m", or "Ends in 2d 4h" past a day, from the real
 * end time, so it can't drift from the offer. Outside the window it keeps the
 * date Liquid rendered ("Ends 23:59 Mon 30 Nov"). `data-window` is the
 * record's `countdown`: none, 24h (the default), 48h or always. The same rule
 * as `campaignCountdown` in packages/shopify/src/campaign-offer.ts.
 *
 * The page may be cached, so the browser's clock is "now", not the render
 * time; `data-now` is set only by the "Campaign preview time" setting, and
 * then the countdown keeps that offset. Wordings come from the locale file,
 * with [h] and [m] standing for the numbers.
 *
 * Not a live region: a screen reader announcing every minute is noise.
 */
const HOUR = 60 * 60 * 1000;

/** @type {Record<string, number>} */
const WINDOWS = { none: 0, "24h": 24 * HOUR, "48h": 48 * HOUR, always: Infinity };

class CampaignEnds extends HTMLElement {
  /** @type {ReturnType<typeof setInterval> | undefined} */
  #timer;

  connectedCallback() {
    const end = Number(this.dataset.end) * 1000;
    if (!Number.isFinite(end)) return;
    const offset = this.dataset.now ? Number(this.dataset.now) * 1000 - Date.now() : 0;
    const label = this.textContent ?? "";
    const span = WINDOWS[this.dataset.window ?? ""] ?? WINDOWS["24h"];

    const update = () => {
      const left = end - (Date.now() + offset);
      if (left <= 0 || left > span) {
        this.textContent = label;
        return;
      }
      const minutes = Math.floor(left / 60_000);
      const hours = Math.floor(minutes / 60);
      const text =
        minutes < 1
          ? this.dataset.soon
          : hours > 24
            ? this.dataset.dh
                ?.replace("[d]", String(Math.floor(hours / 24)))
                .replace("[h]", String(hours % 24))
            : hours > 0
              ? this.dataset.hm
                  ?.replace("[h]", String(hours))
                  .replace("[m]", String(minutes % 60))
              : this.dataset.m?.replace("[m]", String(minutes));
      this.textContent = text ?? label;
    };

    update();
    this.#timer = setInterval(update, 30_000);
  }

  disconnectedCallback() {
    clearInterval(this.#timer);
  }
}

if (!customElements.get("campaign-ends"))
  customElements.define("campaign-ends", CampaignEnds);
