import { starFills } from "@formulate/shopify";
import { useId } from "react";

/**
 * Five stars, partly filled for a fractional average (4.5 shows four and a
 * half). An image with a text name: screen readers hear the label, not five
 * shapes. The same drawing as the app's and the theme's stars.
 */
export const Stars = ({
  value,
  label,
  size = 16,
}: {
  readonly value: number;
  readonly label: string;
  readonly size?: number;
}) => {
  const id = useId();
  return (
    <span role="img" aria-label={label} className="inline-flex gap-0.5 align-middle">
      {starFills(value).map((fill, index) => (
        <svg
          key={index}
          width={size}
          height={size}
          viewBox="0 0 20 20"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id={`${id}-${index}`}>
              <stop offset={fill} stopColor="currentColor" className="text-amber-500" />
              <stop offset={fill} stopColor="#e2e8f0" />
            </linearGradient>
          </defs>
          <path
            fill={`url(#${id}-${index})`}
            d="M10 1.5l2.6 5.3 5.8.8-4.2 4.1 1 5.8L10 14.8l-5.2 2.7 1-5.8L1.6 7.6l5.8-.8z"
          />
        </svg>
      ))}
    </span>
  );
};
