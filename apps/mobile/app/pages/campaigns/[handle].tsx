import {
  availableFirst,
  campaignParagraphs,
  campaignStartFor,
  campaignStartsLabel,
  campaignStatus,
  toCampaign,
} from "@formulate/shopify";
import { Image } from "expo-image";
import { Link, Stack, useLocalSearchParams } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";

import { CampaignBadge } from "../../../components/campaign-badge";
import { CampaignEnds } from "../../../components/campaign-ends";
import { ProductRow } from "../../../components/product-row";
import { SiteFooter } from "../../../components/site-footer";
import {
  startCampaignPreview,
  useCampaign,
  useCampaignView,
} from "../../../lib/campaign";
import { useMarkCampaignSeen } from "../../../lib/use-cart";

/**
 * A campaign's screen (SHO-169), at the same path as its web and theme page,
 * so a shared link opens here. Matches web: the offer and its real end time,
 * the subscriber perk, the products while it's live, and the terms. Before it
 * starts it says when; afterwards that it has ended.
 */
const CampaignScreen = () => {
  const { handle = "", preview } = useLocalSearchParams<{
    handle: string;
    preview?: string;
  }>();
  const { data, isPending, isError } = useCampaign(handle);
  const view = useCampaignView();
  const markSeen = useMarkCampaignSeen();
  const live = (() => {
    const loaded = toCampaign(data?.metaobject);
    return loaded ? campaignStatus(loaded, view) === "active" : false;
  })();

  // A visit while it's live tags the cart (`_campaign`) for the report.
  useEffect(() => {
    if (live) markSeen.mutate(handle);
    // Once per campaign shown live.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, handle]);

  // A preview link (?preview=<token>): the web site checks the token.
  useEffect(() => {
    if (preview) void startCampaignPreview(handle, preview);
  }, [handle, preview]);

  if (isPending) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator />
      </View>
    );
  }

  const campaign = toCampaign(data?.metaobject);
  if (isError || !campaign) {
    return (
      <View className="flex-1 items-center justify-center p-6">
        <Text className="text-base text-foreground-muted">
          {isError
            ? "This campaign couldn't be loaded."
            : "This campaign isn't available."}
        </Text>
      </View>
    );
  }

  const status = campaignStatus(campaign, view);
  const products =
    status === "active"
      ? // Sold-out products last: the page shouldn't lead with one.
        availableFirst(data?.metaobject?.products?.reference?.products.nodes ?? [])
      : [];

  return (
    <ScrollView contentContainerClassName="p-4 gap-6">
      <Stack.Screen
        options={{ title: status === "restricted" ? campaign.title : campaign.badge }}
      />

      {campaign.image ? (
        <Image
          source={campaign.image.url}
          contentFit="cover"
          style={{ width: "100%", aspectRatio: 16 / 9, borderRadius: 12 }}
          accessibilityIgnoresInvertColors
        />
      ) : null}

      <View className="gap-3">
        {status === "restricted" ? null : <CampaignBadge label={campaign.badge} />}
        <Text
          accessibilityRole="header"
          className="text-3xl font-semibold text-foreground"
        >
          {campaign.headline}
        </Text>
        <Text className="text-base text-foreground-muted">
          {status === "upcoming" ? (
            campaignStartsLabel(campaign, campaignStartFor(campaign, view))
          ) : status === "active" ? (
            <CampaignEnds campaign={campaign} />
          ) : status === "restricted" ? (
            "This offer is for our email subscribers. Open it from the link in your email."
          ) : (
            "This offer has ended."
          )}
        </Text>
        {status === "ended" || status === "restricted" ? (
          <View className="gap-2">
            <Link href="/" asChild>
              <Pressable accessibilityRole="link" className="self-start">
                <Text className="text-base text-foreground underline">
                  Shop the range
                </Text>
              </Pressable>
            </Link>
            {status === "ended" ? (
              // The sign-up form is at the bottom of this screen (SiteFooter).
              <Text className="text-base text-foreground">
                Want the next offer first? Sign up for our emails at the bottom of this
                page.
              </Text>
            ) : null}
          </View>
        ) : (
          <>
            {/* The offer itself, always: `body` is optional. */}
            <Text className="text-lg font-semibold text-foreground">
              {campaign.offer}
            </Text>
            {campaignParagraphs(campaign.body).map((paragraph) => (
              <Text key={paragraph} className="text-base text-foreground">
                {paragraph}
              </Text>
            ))}
          </>
        )}
        {(status === "upcoming" || status === "active") && campaign.subscriberPerk ? (
          <View className="rounded-lg border border-border p-3">
            <Text className="text-sm text-foreground">
              <Text className="font-semibold">Subscribers:</Text>{" "}
              {campaign.subscriberPerk}.
            </Text>
          </View>
        ) : null}
      </View>

      {products.length > 0 ? (
        <View className="gap-3">
          <Text
            accessibilityRole="header"
            className="text-xl font-semibold text-foreground"
          >
            In the {campaign.badge} offer
          </Text>
          {products.map((product) => (
            <ProductRow key={product.id} product={product} />
          ))}
        </View>
      ) : null}

      <View className="gap-2">
        <Text
          accessibilityRole="header"
          className="text-base font-semibold text-foreground"
        >
          Terms
        </Text>
        <Text className="text-sm text-foreground-muted">{campaign.terms}</Text>
      </View>

      <SiteFooter />
    </ScrollView>
  );
};

export { CampaignScreen as default };
