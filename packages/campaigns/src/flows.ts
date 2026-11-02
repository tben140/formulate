import type { Campaign } from "@formulate/shopify";

/**
 * The last-day abandoned checkout (SHO-169): someone who started a checkout
 * with the campaign's products and didn't finish hears, an hour later, that
 * the offer ends at midnight. A Klaviyo flow of its own rather than a branch
 * of the live abandoned-cart flow, so nothing live changes: it's created as a
 * draft, and Ben switches it on for the campaign's last day and off after.
 *
 * The trigger filters Shopify's "Checkout Started" on its `Collections`
 * property, which lists every collection of the checkout's products, so it
 * catches checkouts holding at least one of the campaign's.
 */
export interface FlowMetrics {
  /** Shopify's "Checkout Started". */
  readonly checkoutStarted: string;
  /** Shopify's "Placed Order". */
  readonly placedOrder: string;
}

export const urgencySubject = (campaign: Campaign) =>
  `Your ${campaign.badge} basket is saved: the offer ends at midnight`;

export const urgencyFlowName = (campaign: Campaign) =>
  `${campaign.title}: ends tonight (checkout)`;

export const urgencyFlow = (
  campaign: Campaign,
  collectionTitle: string,
  metrics: FlowMetrics,
) => ({
  name: urgencyFlowName(campaign),
  definition: {
    triggers: [
      {
        type: "metric" as const,
        id: metrics.checkoutStarted,
        trigger_filter: {
          condition_groups: [
            {
              conditions: [
                {
                  type: "metric-property" as const,
                  metric_id: metrics.checkoutStarted,
                  field: "Collections",
                  filter: {
                    type: "list" as const,
                    operator: "contains" as const,
                    value: collectionTitle,
                  },
                },
              ],
            },
          ],
        },
      },
    ],
    // Anyone who's ordered since the checkout started is left alone, and
    // only people who can receive marketing email are sent anything.
    profile_filter: {
      condition_groups: [
        {
          conditions: [
            {
              type: "profile-metric" as const,
              metric_id: metrics.placedOrder,
              measurement: "count" as const,
              measurement_filter: {
                type: "numeric" as const,
                operator: "equals" as const,
                value: 0,
              },
              timeframe_filter: {
                type: "date" as const,
                operator: "flow-start" as const,
              },
            },
          ],
        },
        {
          conditions: [
            {
              type: "profile-marketing-consent" as const,
              consent: {
                channel: "email" as const,
                can_receive_marketing: true as const,
                consent_status: { subscription: "subscribed" as const },
              },
            },
          ],
        },
      ],
    },
    // Once per campaign: a second abandoned checkout doesn't send it again.
    reentry_criteria: { duration: 1, unit: "alltime" as const },
    entry_action_id: "wait",
    actions: [
      {
        temporary_id: "wait",
        type: "time-delay" as const,
        data: { value: 1, unit: "hours" as const },
        links: { next: "email" },
      },
      {
        temporary_id: "email",
        type: "send-email" as const,
        data: {
          status: "draft" as const,
          message: {
            name: "Ends tonight",
            subject_line: urgencySubject(campaign),
            preview_text: `${campaign.offer}, until 23:59 tonight.`,
            smart_sending_enabled: true,
          },
        },
      },
    ],
  },
});
