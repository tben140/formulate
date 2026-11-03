import { formatMoney } from "@formulate/shopify";
import { Image } from "expo-image";
import { Link } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Text, TextInput, View } from "react-native";

import { CollectionFilters } from "../../../components/collection-filters";
import { useSearch } from "../../../lib/queries";

/** How long typing must pause before a search runs. */
const DEBOUNCE_MS = 300;

/**
 * Product search (SHO-153), matching the web and theme search pages: results
 * from Shopify's search as Search & Discovery tunes it, with the same filters
 * as a collection.
 *
 * Searches as you type, once typing pauses, rather than on submit: on a phone
 * that's the expected behaviour, and the previous results stay up while the
 * next ones load. The keyboard's search key runs it straight away.
 */
const SearchScreen = () => {
  const [text, setText] = useState("");
  const [term, setTerm] = useState("");
  const [filterQuery, setFilterQuery] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setTerm(text.trim()), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [text]);

  const { data, isFetching, isError, error } = useSearch(term, filterQuery);
  const products = (data?.nodes ?? []).flatMap((node) =>
    node.__typename === "Product" ? [node] : [],
  );
  const searching = term.length >= 2;

  return (
    <FlatList
      data={searching ? products : []}
      keyExtractor={(product) => product.id}
      contentContainerClassName="p-4 gap-3"
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      ListHeaderComponent={
        <View className="mb-2 gap-4">
          <View className="flex-row items-center gap-2">
            <TextInput
              value={text}
              onChangeText={setText}
              onSubmitEditing={() => setTerm(text.trim())}
              placeholder="Search products"
              accessibilityLabel="Search products"
              autoFocus
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="search"
              clearButtonMode="while-editing"
              className="flex-1 rounded-md border border-ink-400 px-3 py-2.5 text-base text-foreground"
            />
            {isFetching ? <ActivityIndicator accessibilityLabel="Searching" /> : null}
          </View>

          {searching && data ? (
            <CollectionFilters
              filters={data.productFilters}
              query={filterQuery}
              onChange={setFilterQuery}
              productCount={products.length}
            />
          ) : null}

          {isError ? (
            <Text accessibilityLiveRegion="polite" className="text-sm text-danger">
              {error.message}
            </Text>
          ) : null}
        </View>
      }
      ListEmptyComponent={
        <Text className="py-12 text-center text-foreground-muted">
          {!searching
            ? "Search by product name, format or ingredient."
            : data && !isFetching
              ? `No products match “${term}”.`
              : ""}
        </Text>
      }
      renderItem={({ item }) => (
        <Link href={`/products/${item.handle}`} asChild>
          <View
            accessibilityRole="link"
            accessibilityLabel={`${item.title}, ${formatMoney(item.priceRange.minVariantPrice)}`}
            className="flex-row items-center gap-3 rounded-lg border border-border p-3"
          >
            <Image
              source={item.featuredImage?.url}
              contentFit="cover"
              transition={150}
              style={{ width: 64, height: 64, borderRadius: 8 }}
              accessibilityIgnoresInvertColors
            />
            <View className="flex-1">
              <Text className="text-base font-medium text-foreground">{item.title}</Text>
              <Text className="mt-1 text-sm text-foreground-muted">
                {formatMoney(item.priceRange.minVariantPrice)}
              </Text>
            </View>
          </View>
        </Link>
      )}
    />
  );
};

export { SearchScreen as default };
