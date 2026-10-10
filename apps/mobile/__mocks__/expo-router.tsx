import { cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";

/**
 * expo-router for Storybook: there's no navigator in a story, so `Link`
 * renders its child (or children) without navigating, and the hooks return
 * fixed values. Registered with `sb.mock` in .storybook/preview.tsx.
 */
export const Link = ({
  children,
  asChild,
}: {
  children: ReactNode;
  asChild?: boolean;
}) =>
  asChild && isValidElement(children) ? (
    cloneElement(children as ReactElement)
  ) : (
    <>{children}</>
  );

const router = { push: () => {}, replace: () => {}, back: () => {} };

export { router };
export const useRouter = () => router;
export const useLocalSearchParams = () => ({});
