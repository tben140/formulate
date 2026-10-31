import {
  availablePresets,
  MIN_BLEND_SIZE,
  type BlendIngredient,
} from "@formulate/shopify";
import { Pressable, Text, View } from "react-native";

/**
 * Choosing a daily pack's ingredients. Matches apps/web's BlendPicker: up to
 * `max`, presets to start from, and each ingredient's amount, authorised
 * claim and caution before it's chosen.
 */
export const BlendPicker = ({
  ingredients,
  picked,
  max,
  onChange,
}: {
  readonly ingredients: readonly BlendIngredient[];
  readonly picked: readonly string[];
  readonly max: number;
  readonly onChange: (codes: string[]) => void;
}) => {
  const presets = availablePresets(ingredients).filter(
    (preset) => preset.codes.length <= max,
  );
  const full = picked.length >= max;

  return (
    <View>
      <Text className="text-sm font-semibold text-foreground">
        Choose your ingredients
      </Text>
      <Text
        accessibilityLiveRegion="polite"
        className="mt-1 text-sm text-foreground-muted"
      >
        {picked.length} of up to {max} chosen
        {picked.length < MIN_BLEND_SIZE ? `. Choose at least ${MIN_BLEND_SIZE}.` : "."}
      </Text>

      {presets.length > 0 ? (
        <View className="mt-3 flex-row flex-wrap gap-2">
          {presets.map((preset) => (
            <Pressable
              key={preset.name}
              accessibilityRole="button"
              accessibilityLabel={`Start from ${preset.name}`}
              onPress={() => onChange([...preset.codes])}
              className="rounded-full border border-border px-3 py-1"
            >
              <Text className="text-sm text-foreground">{preset.name}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <View className="mt-3 gap-2">
        {ingredients.map((ingredient) => {
          const checked = picked.includes(ingredient.code);
          const blocked = !checked && full;
          return (
            <Pressable
              key={ingredient.code}
              accessibilityRole="checkbox"
              accessibilityState={{ checked, disabled: blocked }}
              accessibilityHint={blocked ? `Up to ${max}: remove one first.` : undefined}
              onPress={() =>
                blocked
                  ? undefined
                  : onChange(
                      checked
                        ? picked.filter((code) => code !== ingredient.code)
                        : [...picked, ingredient.code],
                    )
              }
              className={`flex-row gap-3 rounded-md border px-3 py-2 ${
                checked
                  ? "border-brand-600 bg-brand-50"
                  : blocked
                    ? "border-border opacity-60"
                    : "border-border"
              }`}
            >
              <Text className="text-base text-foreground">{checked ? "☑" : "☐"}</Text>
              <View className="flex-1">
                <Text className="text-sm font-medium text-foreground">
                  {ingredient.name}{" "}
                  <Text className="font-normal text-foreground-muted">
                    {ingredient.amount}
                    {ingredient.nrv ? ` · ${ingredient.nrv} NRV` : ""}
                  </Text>
                </Text>
                <Text className="text-sm text-foreground-muted">{ingredient.claim}</Text>
                {ingredient.caution ? (
                  <Text className="text-sm font-medium text-foreground">
                    {ingredient.caution}
                  </Text>
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
};
