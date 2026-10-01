import {
  activeFilterCount,
  isSelected,
  withoutFilters,
  withPriceRange,
  withValueToggled,
  type FilterLike,
} from "@formulate/shopify";
import { useState } from "react";
import { Modal, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/**
 * Search & Discovery filters for a collection (SHO-153), matching the web and
 * theme panels: a Filter button with the active count, removable chips, and a
 * sheet of options.
 *
 * Filter state is the same Liquid-style query string web and the theme put in
 * the URL (`filter.v.option.flavour=Vanilla`), held by the screen. The sheet
 * edits a draft and applies it with "Show results", so ticking several options
 * doesn't refetch on each tap.
 */
export const CollectionFilters = ({
  filters,
  query,
  onChange,
  productCount,
}: {
  readonly filters: readonly FilterLike[];
  readonly query: string;
  readonly onChange: (query: string) => void;
  readonly productCount: number;
}) => {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(query);
  if (filters.length === 0) return null;

  const params = new URLSearchParams(query);
  const active = activeFilterCount(params);

  const chips = filters.flatMap((filter) =>
    filter.type === "PRICE_RANGE"
      ? priceChip(filter, params)
      : filter.values
          .filter((value) => isSelected(params, filter, value))
          .map((value) => ({
            key: value.id,
            label: `${filter.label}: ${value.label}`,
            next: withValueToggled(params, filter, value).toString(),
          })),
  );

  const openSheet = () => {
    setDraft(query);
    setOpen(true);
  };

  return (
    <View className="mb-3 gap-3">
      <View className="flex-row items-center gap-3">
        <Pressable
          onPress={openSheet}
          accessibilityRole="button"
          accessibilityLabel={active > 0 ? `Filter, ${active} active` : "Filter"}
          className="flex-row items-center gap-2 rounded-md border border-border px-4 py-2"
        >
          <Text className="text-sm font-medium text-foreground">Filter</Text>
          {active > 0 ? (
            <View className="rounded-full bg-brand-600 px-2">
              <Text className="text-xs text-surface">{active}</Text>
            </View>
          ) : null}
        </Pressable>
        <Text className="text-sm text-foreground-muted">
          {productCount} {productCount === 1 ? "product" : "products"}
        </Text>
      </View>

      {chips.length > 0 ? (
        <View className="flex-row flex-wrap gap-2">
          {chips.map((chip) => (
            <Pressable
              key={chip.key}
              onPress={() => onChange(chip.next)}
              accessibilityRole="button"
              accessibilityLabel={`${chip.label}, remove filter`}
              className="flex-row items-center gap-1.5 rounded-full border border-border px-3 py-1"
            >
              <Text className="text-sm text-foreground">{chip.label}</Text>
              <Text className="text-sm text-foreground" aria-hidden>
                ×
              </Text>
            </Pressable>
          ))}
          <Pressable
            onPress={() => onChange(withoutFilters(params).toString())}
            accessibilityRole="button"
            className="px-2 py-1"
          >
            <Text className="text-sm text-brand-600 underline">Clear all</Text>
          </Pressable>
        </View>
      ) : null}

      <FilterSheet
        visible={open}
        filters={filters}
        draft={draft}
        setDraft={setDraft}
        onClose={() => setOpen(false)}
        onApply={() => {
          onChange(draft);
          setOpen(false);
        }}
      />
    </View>
  );
};

const FilterSheet = ({
  visible,
  filters,
  draft,
  setDraft,
  onClose,
  onApply,
}: {
  readonly visible: boolean;
  readonly filters: readonly FilterLike[];
  readonly draft: string;
  readonly setDraft: (query: string) => void;
  readonly onClose: () => void;
  readonly onApply: () => void;
}) => {
  const { bottom } = useSafeAreaInsets();
  const params = new URLSearchParams(draft);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View className="flex-1 bg-surface">
        <View className="flex-row items-center justify-between border-b border-border px-4 py-4">
          <Text
            accessibilityRole="header"
            className="text-lg font-semibold text-foreground"
          >
            Filter
          </Text>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close filters"
          >
            <Text className="text-base text-brand-600">Close</Text>
          </Pressable>
        </View>

        <ScrollView
          contentContainerClassName="gap-6 p-4"
          keyboardShouldPersistTaps="handled"
        >
          {filters.map((filter) =>
            filter.type === "PRICE_RANGE" ? (
              <PriceGroup
                key={filter.id}
                filter={filter}
                params={params}
                setDraft={setDraft}
              />
            ) : (
              <View key={filter.id} className="gap-1">
                <Text
                  accessibilityRole="header"
                  className="mb-1 text-sm font-semibold text-foreground"
                >
                  {filter.label}
                </Text>
                {filter.values.map((value) => {
                  const checked = isSelected(params, filter, value);
                  const empty = value.count === 0 && !checked;
                  return (
                    <Pressable
                      key={value.id}
                      disabled={empty}
                      onPress={() =>
                        setDraft(withValueToggled(params, filter, value).toString())
                      }
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked, disabled: empty }}
                      accessibilityLabel={`${value.label}, ${value.count} ${value.count === 1 ? "product" : "products"}`}
                      className="flex-row items-center gap-3 py-2"
                    >
                      {/* ink-500, not the hairline border colour: a checkbox's
                          outline needs 3:1 against white (WCAG 1.4.11). */}
                      <View
                        className={`h-5 w-5 items-center justify-center rounded border ${
                          checked ? "border-brand-600 bg-brand-600" : "border-ink-500"
                        }`}
                      >
                        {checked ? (
                          <Text className="text-xs font-bold text-surface">✓</Text>
                        ) : null}
                      </View>
                      <Text
                        className={`text-base ${empty ? "text-foreground-muted" : "text-foreground"}`}
                      >
                        {value.label}
                      </Text>
                      <Text className="text-base text-foreground-muted">
                        ({value.count})
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ),
          )}
        </ScrollView>

        <View
          className="flex-row items-center gap-4 border-t border-border px-4 pt-3"
          style={{ paddingBottom: Math.max(bottom, 12) }}
        >
          <Pressable
            onPress={() => setDraft(withoutFilters(params).toString())}
            accessibilityRole="button"
            className="py-3"
          >
            <Text className="text-base text-brand-600 underline">Clear all</Text>
          </Pressable>
          <Pressable
            onPress={onApply}
            accessibilityRole="button"
            className="flex-1 items-center rounded-md bg-brand-600 py-3"
          >
            <Text className="text-base font-semibold text-surface">Show results</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
};

/** "12.5" → 12.5; anything else (empty, negative, letters) → null. */
const toAmount = (text: string): number | null => {
  const amount = Number(text.trim());
  return text.trim() !== "" && Number.isFinite(amount) && amount >= 0 ? amount : null;
};

const PriceGroup = ({
  filter,
  params,
  setDraft,
}: {
  readonly filter: FilterLike;
  readonly params: URLSearchParams;
  readonly setDraft: (query: string) => void;
}) => {
  const min = params.get(`${filter.id}.gte`);
  const max = params.get(`${filter.id}.lte`);
  const set = (nextMin: string | null, nextMax: string | null) =>
    setDraft(
      withPriceRange(
        params,
        filter,
        nextMin === null ? null : toAmount(nextMin),
        nextMax === null ? null : toAmount(nextMax),
      ).toString(),
    );

  return (
    <View className="gap-2">
      <Text accessibilityRole="header" className="text-sm font-semibold text-foreground">
        {filter.label}
      </Text>
      <View className="flex-row gap-4">
        {(
          [
            ["From", min, (text: string) => set(text, max)],
            ["To", max, (text: string) => set(min, text)],
          ] as const
        ).map(([label, value, onChangeText]) => (
          <View key={label} className="flex-1 gap-1">
            <Text className="text-sm text-foreground">{label}</Text>
            <TextInput
              defaultValue={value ?? ""}
              onEndEditing={(event) => onChangeText(event.nativeEvent.text)}
              keyboardType="decimal-pad"
              accessibilityLabel={`${filter.label} ${label.toLowerCase()}, pounds`}
              placeholder="£"
              className="rounded-md border border-border px-3 py-2 text-base text-foreground"
            />
          </View>
        ))}
      </View>
    </View>
  );
};

const priceChip = (filter: FilterLike, params: URLSearchParams) => {
  const min = params.get(`${filter.id}.gte`);
  const max = params.get(`${filter.id}.lte`);
  if (!min && !max) return [];
  const label = min && max ? `£${min} – £${max}` : min ? `From £${min}` : `Up to £${max}`;
  return [
    {
      key: filter.id,
      label: `${filter.label}: ${label}`,
      next: withPriceRange(params, filter, null, null).toString(),
    },
  ];
};
