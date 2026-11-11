import {
  deliveryPromise,
  expressCheckoutOnProduct,
  FREE_GIFT_CONDITION,
  FREE_GIFT_LABEL,
  FREE_GIFT_PRICE,
  freeGiftMessage,
  findVariantByOptions,
  formatMoney,
  ONE_TIME,
  renewalTerms,
  savingMessage,
  SUBSCRIPTION_PERKS,
  withOption,
} from "@formulate/shopify";
import { Pressable, View, type LayoutChangeEvent } from "react-native";

import { ExpressCheckout } from "../lib/checkout";
import type { Product, Purchase } from "../lib/use-purchase";
import { ShopImage } from "./shop-image";
import { Text } from "./text";

/**
 * Variant pickers, subscribe-and-save, and add to cart.
 *
 * The state lives in `usePurchase`, owned by the product screen, because the
 * sticky bar renders the same selection (SHO-117). This component only draws
 * it. `onButtonLayout` reports where the button sits, so the screen can show
 * the bar while it is scrolled out of view.
 */
export const AddToCart = ({
  product,
  purchase,
  onAdded,
  onButtonLayout,
}: {
  readonly product: Product;
  readonly purchase: Purchase;
  readonly onAdded: () => void;
  readonly onButtonLayout?: (event: LayoutChangeEvent) => void;
}) => {
  const {
    addToCart,
    selected,
    setSelected,
    setPlanId,
    variant,
    allocations,
    effectivePlanId,
    displayPrice,
    quote,
    cards,
    chosenCard,
    gift,
    disabled,
    label,
    add,
  } = purchase;

  const planName =
    allocations.find((a) => a.sellingPlan.id === effectivePlanId)?.sellingPlan.name ??
    null;

  return (
    // No outer margin here: the product screen measures this view's top to
    // place the button, and a margin inside it would put that 8px out.
    <View className="gap-5">
      {product.options.map((option) => {
        // A single option called "Title" with one value is Shopify's stand-in
        // for "this product has no options".
        if (option.optionValues.length <= 1) return null;
        const current = selected.find((o) => o.name === option.name)?.value;
        // Values with a swatch set in the admin show it, above their name.
        const swatches = option.optionValues.some((value) => value.swatch);
        return (
          <View key={option.name}>
            {/* The choice beside the name, so it reads without scanning. */}
            <Text className="mb-2 text-xs font-semibold tracking-wide text-foreground uppercase">
              {option.name}
              {current ? (
                <Text className="font-normal tracking-normal normal-case">
                  : {current}
                </Text>
              ) : null}
            </Text>
            <View className={`flex-row flex-wrap ${swatches ? "gap-3" : "gap-2"}`}>
              {option.optionValues.map((value) => {
                const candidate = withOption(selected, option.name, value.name);
                const match = findVariantByOptions(product.variants.nodes, candidate);
                const checked = current === value.name;
                const soldOut = Boolean(match && !match.availableForSale);
                const image = value.swatch?.image?.previewImage?.url;

                return (
                  <Pressable
                    key={value.name}
                    onPress={() => setSelected(candidate)}
                    accessibilityRole="radio"
                    // aria-checked, not accessibilityState.selected: a radio
                    // is checked, and react-native-web only writes
                    // aria-checked from the aria- prop, including false.
                    aria-checked={checked}
                    // Sold-out combinations stay selectable — a shopper who
                    // wants one needs to select it and be told it is gone.
                    accessibilityLabel={soldOut ? `${value.name}, sold out` : value.name}
                    className={
                      swatches
                        ? "w-16 items-center gap-1"
                        : `rounded-md border px-3 py-2 ${
                            checked ? "border-brand-600 bg-brand-50" : "border-border"
                          }`
                    }
                  >
                    {swatches ? (
                      <View
                        className={`h-12 w-12 items-center justify-center rounded-full border-2 ${
                          checked ? "border-brand-600" : "border-transparent"
                        }`}
                      >
                        <View
                          className={`h-10 w-10 overflow-hidden rounded-full border border-border ${
                            soldOut ? "opacity-50" : ""
                          }`}
                          style={{ backgroundColor: value.swatch?.color ?? undefined }}
                        >
                          {image ? (
                            <ShopImage
                              url={image}
                              width={40}
                              height={40}
                              transition={0}
                              style={{ width: 40, height: 40 }}
                            />
                          ) : null}
                        </View>
                      </View>
                    ) : null}
                    <Text
                      className={`${swatches ? "text-center text-xs" : "text-sm"} ${
                        // Muted grey on the selected brand-50 is 4.34:1,
                        // under AA's 4.5:1: selected keeps full strength.
                        soldOut
                          ? `line-through ${checked ? "text-foreground" : "text-foreground-muted"}`
                          : "text-foreground"
                      } ${checked ? "font-medium" : ""}`}
                    >
                      {value.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        );
      })}

      {allocations.length > 0 ? (
        <View>
          <Text className="mb-2 text-xs font-semibold tracking-wide text-foreground uppercase">
            Purchase options
          </Text>
          {/*
            Plans first, as cards; one-time last, a card of its own and the
            default. Nothing is chosen for the shopper (purchase-cards.ts).
          */}
          <View className="gap-2">
            {cards.map((card) => {
              const chosen = effectivePlanId === card.id;
              const plan = card.id !== ONE_TIME;
              const perks = [
                ...(card.quote.saving ? [savingMessage(card.quote.saving)] : []),
                ...SUBSCRIPTION_PERKS,
              ];
              return (
                <Pressable
                  key={card.id || "one-time"}
                  onPress={() => setPlanId(card.id)}
                  accessibilityRole="radio"
                  aria-checked={chosen}
                  accessibilityLabel={[
                    card.title,
                    card.savePercent ? `save ${card.savePercent}%` : null,
                    card.bestValue ? "best value" : null,
                    card.quote.saving
                      ? `${formatMoney(card.quote.price)} instead of ${formatMoney(card.quote.oneTime)}`
                      : formatMoney(card.quote.price),
                    card.detail,
                    card.perDay,
                    ...(chosen && plan ? perks : []),
                  ]
                    .filter(Boolean)
                    .join(". ")}
                  className={`rounded-lg border-2 px-4 py-3 ${
                    chosen ? "border-brand-600 bg-brand-50" : "border-border"
                  }`}
                >
                  <View className="flex-row items-start justify-between gap-3">
                    <View className="flex-1 flex-row flex-wrap items-center gap-2">
                      <Text className="text-base font-semibold text-foreground">
                        {card.title}
                      </Text>
                      {card.savePercent ? (
                        <Text className="overflow-hidden rounded-full bg-brand-600 px-2 py-0.5 text-xs font-semibold text-surface">
                          Save {card.savePercent}%
                        </Text>
                      ) : null}
                      {card.bestValue ? (
                        <Text className="overflow-hidden rounded-full border border-brand-600 px-2 py-0.5 text-xs font-semibold text-brand-700">
                          Best value
                        </Text>
                      ) : null}
                    </View>
                    {/* Full strength: muted grey on brand-50 is under AA. */}
                    <View className="items-end">
                      {card.quote.saving ? (
                        // The one-time price for the same supply, on sale now:
                        // a real comparison (subscribe-and-save.ts).
                        <Text className="font-mono text-xs text-foreground line-through">
                          {formatMoney(card.quote.oneTime)}
                        </Text>
                      ) : null}
                      <Text className="font-mono text-lg text-foreground">
                        {formatMoney(card.quote.price)}
                      </Text>
                    </View>
                  </View>
                  <View className="mt-1 flex-row justify-between gap-3">
                    <Text className="flex-1 text-xs text-foreground">{card.detail}</Text>
                    {card.perDay ? (
                      <Text className="font-mono text-xs text-foreground">
                        {card.perDay}
                      </Text>
                    ) : null}
                  </View>
                  {chosen && plan ? (
                    // What subscribing gives, on the chosen plan only.
                    <View className="mt-3 gap-1 border-t border-border pt-3">
                      {perks.map((perk) => (
                        <View key={perk} className="flex-row gap-2">
                          <Text className="text-sm text-brand-600">✓</Text>
                          <Text className="flex-1 text-sm text-foreground">{perk}</Text>
                        </View>
                      ))}
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      {gift ? (
        // The free gift, styled as a purchase option but not one to choose:
        // it comes with whichever option is picked (free-gift.ts). Read as
        // one sentence by VoiceOver and TalkBack.
        <View
          accessible
          accessibilityLabel={freeGiftMessage(gift)}
          className="flex-row items-center justify-between gap-3 rounded-md border border-border px-3 py-3"
        >
          <View className="min-w-0 flex-1 flex-row items-center gap-3">
            {gift.image ? (
              <ShopImage
                url={gift.image.url}
                width={40}
                height={40}
                transition={0}
                style={{ width: 40, height: 40, borderRadius: 8 }}
              />
            ) : null}
            <View className="min-w-0 flex-1">
              <Text className="text-xs font-medium text-brand-600">
                {FREE_GIFT_LABEL}
              </Text>
              <Text className="text-sm text-foreground">{gift.product.title}</Text>
              <Text className="text-xs text-foreground-muted">{FREE_GIFT_CONDITION}</Text>
            </View>
          </View>
          <Text className="font-mono text-sm text-brand-600">{FREE_GIFT_PRICE}</Text>
        </View>
      ) : null}

      {displayPrice ? (
        allocations.length > 0 ? (
          // The cards carry the price; this is what applies to every option.
          <Text className="text-sm text-foreground-muted">{deliveryPromise()}</Text>
        ) : (
          <View>
            <Text className="text-2xl font-semibold text-foreground font-mono">
              {formatMoney(displayPrice)}
            </Text>
            <Text className="mt-1 text-sm text-foreground-muted">
              {chosenCard?.perDay} · {deliveryPromise()}
            </Text>
          </View>
        )
      ) : null}

      <Pressable
        disabled={disabled}
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        onPress={() => add(onAdded)}
        onLayout={onButtonLayout}
        className={`rounded-md px-4 py-3 ${disabled ? "bg-ink-300" : "bg-brand-600"}`}
      >
        <Text className="text-center text-sm font-semibold text-surface">{label}</Text>
      </Pressable>

      {variant?.availableForSale && expressCheckoutOnProduct(effectivePlanId) && !gift ? (
        // Not with a free gift either: Checkout Kit's product button buys one
        // variant and can't nest the gift, so it would be lost. The cart's
        // button includes it.
        // One-time purchases only: a wallet can skip checkout, where the
        // subscription terms are shown (packages/shopify/src/express-checkout.ts).
        <ExpressCheckout variantId={variant.id} quantity={quote?.units ?? 1} />
      ) : null}

      {effectivePlanId && displayPrice && planName ? (
        // The renewal terms, before purchase and next to the button
        // (California's Automatic Renewal Law; the UK's DMCC rules from 2027).
        <Text className="text-xs text-foreground-muted">
          {renewalTerms(displayPrice, planName, quote?.later, quote?.units, quote?.pack)}
        </Text>
      ) : null}

      {/*
        The sheet sliding up is a visual event VoiceOver does not narrate, and
        an error here is the only thing a shopper can act on. `polite` because
        nothing here is urgent enough to interrupt.
      */}
      {addToCart.isError ? (
        <Text
          accessibilityLiveRegion="polite"
          role="alert"
          className="text-sm text-danger"
        >
          {addToCart.error.message}
        </Text>
      ) : null}

      {/*
        Fewer were added than chosen, because that is all there is. Shown in
        the neutral colour: the add worked, but the quantity is not what the
        shopper picked, so it must not read as a plain success.
      */}
      {addToCart.isSuccess && addToCart.data.notice ? (
        <Text accessibilityLiveRegion="polite" className="text-sm text-foreground">
          {addToCart.data.notice}
        </Text>
      ) : null}
    </View>
  );
};
