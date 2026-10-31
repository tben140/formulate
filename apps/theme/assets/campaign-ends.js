/**
 * A campaign's end, counting down in its last day (SHO-169): "Ends in 5h
 * 12m", from the real end time, so it can't drift from the offer. Before
 * then it keeps the date Liquid rendered ("Ends 23:59 Mon 30 Nov"). The same
 * rule as `campaignCountdown` in packages/shopify/src/campaign-offer.ts.
 *
 * The page may be cached, so the browser's clock is "now", not the render
 * time; `data-now` is set only by the "Campaign preview time" setting, and
 * then the countdown keeps that offset. Wordings come from the locale file,
 * with [h] and [m] standing for the numbers.
 *
 * Not a live region: a screen reader announcing every minute is noise.
 */
class CampaignEnds extends HTMLElement {
  /** @type {ReturnType<typeof setInterval> | undefined} */
  #timer;

  connectedCallback() {
    const end = Number(this.dataset.end) * 1000;
    if (!Number.isFinite(end)) return;
    const offset = this.dataset.now ? Number(this.dataset.now) * 1000 - Date.now() : 0;
    const label = this.textContent ?? "";

    const update = () => {
      const left = end - (Date.now() + offset);
      if (left <= 0 || left > 24 * 60 * 60 * 1000) {
        this.textContent = label;
        return;
      }
      const minutes = Math.floor(left / 60_000);
      const hours = Math.floor(minutes / 60);
      const text =
        minutes < 1
          ? this.dataset.soon
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
