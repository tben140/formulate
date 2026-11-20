import {
  formatReviewDate,
  ratingLabel,
  singleRatingLabel,
  type PublicReview,
  type ReviewSummary,
} from "@formulate/shopify";
import { Image } from "expo-image";
import { Pressable, Text, View } from "react-native";

import { useReviews } from "../lib/reviews";
import { Stars } from "./stars";

const ReviewItem = ({ review }: { readonly review: PublicReview }) => (
  <View className="gap-2 border-t border-border py-4">
    <View className="flex-row flex-wrap items-center gap-2">
      <Stars value={review.rating} label={singleRatingLabel(review.rating)} size={14} />
      {review.title ? (
        <Text className="font-semibold text-foreground">{review.title}</Text>
      ) : null}
    </View>
    {/* Always labelled: invented reviews shown as genuine are unlawful (DMCC Act 2024). */}
    {review.sample ? (
      <Text className="self-start rounded border border-border bg-surface-muted px-2 py-0.5 text-xs font-medium text-foreground">
        Sample review, written for this demo store
      </Text>
    ) : null}
    {review.body ? (
      <Text className="text-base text-foreground">{review.body}</Text>
    ) : null}
    {review.pictures.length > 0 ? (
      <View className="flex-row gap-2">
        {review.pictures.slice(0, 4).map((url, index, shown) => (
          <Image
            key={url}
            source={url}
            contentFit="cover"
            style={{ width: 64, height: 64, borderRadius: 6 }}
            alt={`From ${review.author}'s review, ${index + 1} of ${shown.length}`}
            accessibilityLabel={`From ${review.author}'s review, ${index + 1} of ${shown.length}`}
            accessibilityIgnoresInvertColors
          />
        ))}
      </View>
    ) : null}
    <Text className="text-sm text-foreground-muted">
      {review.author}
      {review.verifiedBuyer ? " · Verified buyer" : ""}
      {review.createdAt ? ` · ${formatReviewDate(review.createdAt)}` : ""}
    </Text>
  </View>
);

/**
 * The product's reviews, matching web's components/product-reviews.tsx: the
 * summary, the reviews ten at a time, "Show more reviews". Hidden entirely if
 * they can't be loaded: a missing list isn't a reason for the screen to fail.
 */
export const ProductReviews = ({
  handle,
  summary,
}: {
  readonly handle: string;
  readonly summary: ReviewSummary | null;
}) => {
  const reviews = useReviews(handle);
  if (reviews.isError || !reviews.data) return null;
  const list = reviews.data.pages.flatMap((page) => page.reviews);

  return (
    <View className="mt-4 gap-2">
      <Text accessibilityRole="header" className="text-xl font-semibold text-foreground">
        Reviews
      </Text>
      {summary ? (
        <View className="flex-row items-center gap-2">
          <Stars value={summary.average} label={ratingLabel(summary)} />
          <Text
            importantForAccessibility="no-hide-descendants"
            accessibilityElementsHidden
            className="text-sm text-foreground"
          >
            {summary.average} · {summary.count}{" "}
            {summary.count === 1 ? "review" : "reviews"}
          </Text>
        </View>
      ) : null}
      {list.length === 0 ? (
        <Text className="text-foreground-muted">No reviews yet.</Text>
      ) : (
        <View className="border-b border-border">
          {list.map((review) => (
            <ReviewItem key={review.id} review={review} />
          ))}
        </View>
      )}
      {reviews.hasNextPage ? (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ busy: reviews.isFetchingNextPage }}
          onPress={() => void reviews.fetchNextPage()}
          className="mt-2 items-center rounded-md border border-border px-4 py-3"
        >
          <Text className="text-sm font-semibold text-foreground">
            {reviews.isFetchingNextPage ? "Loading…" : "Show more reviews"}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
};
