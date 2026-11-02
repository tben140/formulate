import { tagCampaign } from "@theme/cart-api";

/**
 * On a live campaign's page (SHO-169): tags the cart with the campaign
 * (`_campaign`), as web and the app do, so `campaigns report` counts the
 * order even without the campaign's discount. Best effort: a failure costs
 * nothing but the tag.
 */
class CampaignSeen extends HTMLElement {
  connectedCallback() {
    const handle = this.dataset.handle ?? "";
    if (/^[a-z0-9-]{1,64}$/.test(handle)) tagCampaign(handle).catch(() => undefined);
  }
}

if (!customElements.get("campaign-seen"))
  customElements.define("campaign-seen", CampaignSeen);
