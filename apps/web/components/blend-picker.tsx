"use client";

import { availablePresets, type BlendIngredient } from "@formulate/shopify";

/**
 * Choosing a daily pack's ingredients. Up to `max`; the pack size (and price)
 * follows the count. Each ingredient shows its amount and authorised claim,
 * and its caution before it's chosen, not after.
 *
 * Checkboxes in a fieldset, so it's a plain form control to keyboards and
 * screen readers. The count is announced as it changes.
 */
export const BlendPicker = ({
  ingredients,
  picked,
  max,
  min,
  onChange,
}: {
  readonly ingredients: readonly BlendIngredient[];
  readonly picked: readonly string[];
  readonly max: number;
  readonly min: number;
  readonly onChange: (codes: string[]) => void;
}) => {
  const presets = availablePresets(ingredients).filter(
    (preset) => preset.codes.length <= max,
  );
  const full = picked.length >= max;

  return (
    <fieldset className="mb-5">
      <legend className="mb-1 text-sm font-semibold">Choose your ingredients</legend>
      <p className="mb-3 text-sm text-foreground-muted" aria-live="polite">
        {picked.length} of up to {max} chosen
        {picked.length < min ? `. Choose at least ${min}.` : "."}
      </p>

      {presets.length > 0 ? (
        <div className="mb-3 flex flex-wrap gap-2">
          <span className="w-full text-xs font-semibold text-foreground-muted">
            Or start from
          </span>
          {presets.map((preset) => (
            <button
              key={preset.name}
              type="button"
              onClick={() => onChange([...preset.codes])}
              className="rounded-full border border-border px-3 py-1 text-sm hover:border-foreground-muted"
            >
              {preset.name}
            </button>
          ))}
        </div>
      ) : null}

      <ul className="space-y-2">
        {ingredients.map((ingredient) => {
          const checked = picked.includes(ingredient.code);
          const blocked = !checked && full;
          return (
            <li key={ingredient.code}>
              <label
                className={`flex gap-3 rounded-md border px-3 py-2 text-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand-600 ${
                  checked
                    ? "border-brand-600 bg-brand-50"
                    : blocked
                      ? "border-border opacity-60"
                      : "cursor-pointer border-border hover:border-foreground-muted"
                }`}
              >
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={checked}
                  // aria-disabled rather than disabled keeps it focusable and
                  // its reason readable; the change is refused below.
                  aria-disabled={blocked || undefined}
                  onChange={() =>
                    blocked
                      ? undefined
                      : onChange(
                          checked
                            ? picked.filter((code) => code !== ingredient.code)
                            : [...picked, ingredient.code],
                        )
                  }
                />
                <span className="min-w-0">
                  <span className="font-medium text-foreground">{ingredient.name}</span>{" "}
                  <span className="font-mono text-foreground-muted">
                    {ingredient.amount}
                    {ingredient.nrv ? ` · ${ingredient.nrv} NRV` : ""}
                  </span>
                  <span className="block text-foreground-muted">{ingredient.claim}</span>
                  {ingredient.caution ? (
                    <span className="block font-medium text-foreground">
                      {ingredient.caution}
                    </span>
                  ) : null}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
};
