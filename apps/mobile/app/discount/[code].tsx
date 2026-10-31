import { campaignHandleFromPath, safeRedirectPath } from "@formulate/shopify";
import { router, useLocalSearchParams, type Href } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";

import { grantCampaignAccess } from "../../lib/campaign";
import { useApplyDiscountCode } from "../../lib/use-cart";

/**
 * An email link's discount (SHO-169): `/discount/<code>?redirect=<path>`, the
 * same link web and the theme take. Puts the code on the cart, remembers an
 * email-only campaign as reached, then opens `redirect`.
 *
 * A failed or invalid code still moves on: Shopify decides at checkout, and the
 * cart simply shows no discount.
 */
const DiscountLink = () => {
  const { code = "", redirect } = useLocalSearchParams<{
    code: string;
    redirect?: string;
  }>();
  const apply = useApplyDiscountCode();

  useEffect(() => {
    const target = safeRedirectPath(redirect);
    const handle = campaignHandleFromPath(target);
    void (async () => {
      if (handle) await grantCampaignAccess(handle);
      if (code) await apply.mutateAsync(code.trim().slice(0, 255)).catch(() => undefined);
      router.replace(target as Href);
    })();
    // Once per link opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, redirect]);

  return (
    <View className="flex-1 items-center justify-center">
      <ActivityIndicator accessibilityLabel="Applying your offer" />
    </View>
  );
};

export { DiscountLink as default };
