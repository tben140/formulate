import {
  activeFilterCount,
  collectionSort,
  filterGroups,
  FILTER_VALUES_SHOWN,
  isSelected,
  priceRangeLabel,
  SORT_OPTIONS,
  withoutFilters,
  withPriceRange,
  withSort,
  withValueToggled,
  type FilterGroup,
  type FilterLike,
} from "@formulate/shopify";
import { useState } from "react";
import { Modal, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { COLLECTION_PAGE_SIZE, useCollection } from "../lib/queries";

/**
 * Search & Discovery filters and the sort for a collection (SHO-153),
 * matching the web and theme panels: a "Filter & sort" button with the active
 * count, removable chips, and a sheet of options.
 *
 * Filter state is the same Liquid-style query string web and the theme put in
 * the URL (`filter.v.option.flavour=Vanilla&sort_by=price-ascending`), held by
 * the screen. The sheet edits a draft and applies it with "Show N products",
 * so ticking several options doesn't reload the list on each tap; the count
 * and the options' own counts follow the draft as you go.
 *
 * As on web (filterGroups): values that would change nothing are left out,
 * the first few groups start open, and long ones show five values and "Show
 * more".
 */
export const CollectionFilters = ({
  handle,
  filters,
  query,
  onChange,
  productCount,
}: {
  /** A collection's handle: it adds the sort and the sheet's live count. */
  readonly handle?: string;
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
  const sort = collectionSort(params);
  const title = handle === undefined ? "Filter" : "Filter & sort";

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
          accessibilityLabel={`${title}${active > 0 ? `, ${active} active` : ""}`}
          className="flex-row items-center gap-2 rounded-md border border-border px-4 py-2"
        >
          <Text className="text-sm font-medium text-foreground">{title}</Text>
          {active > 0 ? (
            <View className="rounded-full bg-brand-600 px-2">
              <Text className="text-xs text-surface">{active}</Text>
            </View>
          ) : null}
        </Pressable>
        <Text className="text-sm text-foreground-muted">
          {productCount} {productCount === 1 ? "product" : "products"}
          {handle !== undefined && sort.value ? ` · ${sort.label}` : ""}
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
        handle={handle}
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
  handle,
  visible,
  filters,
  draft,
  setDraft,
  onClose,
  onApply,
}: {
  readonly handle: string | undefined;
  readonly visible: boolean;
  readonly filters: readonly FilterLike[];
  readonly draft: string;
  readonly setDraft: (query: string) => void;
  readonly onClose: () => void;
  readonly onApply: () => void;
}) => {
  const { bottom } = useSafeAreaInsets();
  const params = new URLSearchParams(draft);
  // The price fields are uncontrolled, so "Clear all" remounts them (a new key)
  // to empty what they show along with the draft.
  const [clears, setClears] = useState(0);
  // Groups the shopper opened or closed, over where filterGroups starts them.
  const [toggled, setToggled] = useState<Record<string, boolean>>({});

  // The draft's own results: its count, and options counted against it. The
  // applied query is already cached, so opening the sheet costs nothing.
  const preview = useCollection(handle ?? "", {
    filterQuery: draft,
    enabled: visible && handle !== undefined,
  });
  const products = preview.data?.collection?.products;
  const count = products?.nodes.length;
  const groups = filterGroups(
    products?.filters ?? filters,
    params,
    count !== undefined && count < COLLECTION_PAGE_SIZE ? count : null,
  );
  const sort = collectionSort(params);

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
            {handle === undefined ? "Filter" : "Filter & sort"}
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
          contentContainerClassName="px-4 pb-4"
          keyboardShouldPersistTaps="handled"
        >
          {handle !== undefined ? (
            <View className="gap-1 border-b border-border py-4">
              <Text
                accessibilityRole="header"
                className="mb-1 text-sm font-semibold text-foreground"
              >
                Sort by
              </Text>
              {SORT_OPTIONS.map((option) => {
                const selected = option.value === sort.value;
                return (
                  <Pressable
                    key={option.value}
                    onPress={() => setDraft(withSort(params, option.value).toString())}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected }}
                    className="flex-row items-center gap-3 py-2"
                  >
                    <View
                      className={`h-5 w-5 items-center justify-center rounded-full border ${
                        selected ? "border-brand-600" : "border-ink-500"
                      }`}
                    >
                      {selected ? (
                        <View className="h-2.5 w-2.5 rounded-full bg-brand-600" />
                      ) : null}
                    </View>
                    <Text className="text-base text-foreground">{option.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          {groups.map((group) => (
            <GroupView
              key={group.filter.id}
              group={group}
              open={toggled[group.filter.id] ?? group.open}
              onToggle={(open) =>
                setToggled((was) => ({ ...was, [group.filter.id]: open }))
              }
              params={params}
              setDraft={setDraft}
              clears={clears}
            />
          ))}
        </ScrollView>

        <View
          className="flex-row items-center gap-4 border-t border-border px-4 pt-3"
          style={{ paddingBottom: Math.max(bottom, 12) }}
        >
          <Pressable
            onPress={() => {
              setDraft(withoutFilters(params).toString());
              setClears((was) => was + 1);
            }}
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
            <Text className="text-base font-semibold text-surface">
              {count === undefined
                ? "Show results"
                : `Show ${count}${count === COLLECTION_PAGE_SIZE ? "+" : ""} ${count === 1 ? "product" : "products"}`}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
};

const GroupView = ({
  group,
  open,
  onToggle,
  params,
  setDraft,
  clears,
}: {
  readonly group: FilterGroup;
  readonly open: boolean;
  readonly onToggle: (open: boolean) => void;
  readonly params: URLSearchParams;
  readonly setDraft: (query: string) => void;
  readonly clears: number;
}) => {
  const { filter, values } = group;
  const [showAll, setShowAll] = useState(group.moreOpen);
  const shown = showAll ? values : values.slice(0, FILTER_VALUES_SHOWN);
  const hidden = values.length - FILTER_VALUES_SHOWN;

  return (
    <View className="border-b border-border py-2">
      <Pressable
        onPress={() => onToggle(!open)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={
          group.selected > 0
            ? `${filter.label}, ${group.selected} selected`
            : filter.label
        }
        className="flex-row items-center justify-between py-2"
      >
        <View className="flex-row items-center gap-2">
          <Text className="text-sm font-semibold text-foreground">{filter.label}</Text>
          {group.selected > 0 ? (
            <View className="rounded-full bg-brand-600 px-1.5">
              <Text className="text-xs text-surface">{group.selected}</Text>
            </View>
          ) : null}
        </View>
        <Text aria-hidden className="text-sm text-foreground-muted">
          {open ? "▴" : "▾"}
        </Text>
      </Pressable>

      {open && filter.type === "PRICE_RANGE" ? (
        <PriceGroup key={clears} filter={filter} params={params} setDraft={setDraft} />
      ) : null}

      {open && filter.type !== "PRICE_RANGE" ? (
        <View className="pb-2">
          {shown.map((value) => {
            const checked = isSelected(params, filter, value);
            return (
              <Pressable
                key={value.id}
                onPress={() =>
                  setDraft(withValueToggled(params, filter, value).toString())
                }
                accessibilityRole="checkbox"
                accessibilityState={{ checked }}
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
                <Text className="text-base text-foreground">{value.label}</Text>
                <Text className="text-base text-foreground-muted">({value.count})</Text>
              </Pressable>
            );
          })}
          {hidden > 0 ? (
            <Pressable
              onPress={() => setShowAll(!showAll)}
              accessibilityRole="button"
              className="py-2"
            >
              <Text className="text-sm text-brand-600 underline">
                {showAll ? "Show fewer" : `Show ${hidden} more`}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
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
  const range = priceRangeLabel(filter);
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
    <View className="gap-2 pb-3">
      {/* The range as a hint, not a placeholder that looks like an entry. */}
      {range ? (
        <Text className="text-xs text-foreground-muted">Range {range}</Text>
      ) : null}
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
              // Into the draft on every keystroke, not on blur: "Show results"
              // sits outside the scroll view and doesn't blur the field, and
              // iOS's decimal pad has no return key, so a price typed and then
              // applied would be lost. Uncontrolled, so "12." isn't rewritten.
              onChangeText={onChangeText}
              keyboardType="decimal-pad"
              accessibilityLabel={`${filter.label} ${label.toLowerCase()}, pounds`}
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
