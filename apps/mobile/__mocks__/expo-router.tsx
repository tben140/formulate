import { cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";

type Href = string | { pathname: string };

/** A click that stays in the story: the link is real, the navigation isn't. */
const stay = (event: { preventDefault: () => void }) => event.preventDefault();

/**
 * expo-router for Storybook: there's no navigator in a story, so `Link`
 * renders a real link that doesn't navigate, and the hooks return fixed
 * values. Registered with `sb.mock` in .storybook/preview.tsx.
 *
 * The link keeps its `href`: React Native Web renders a View with `href` as
 * an anchor, so keyboard users can focus it as they can in the app, and a
 * story labelled as a link behaves like one.
 */
export const Link = ({
  children,
  asChild,
  href,
}: {
  children: ReactNode;
  asChild?: boolean;
  href: Href;
}) => {
  const target = typeof href === "string" ? href : href.pathname;
  return asChild && isValidElement(children) ? (
    cloneElement(children as ReactElement<Record<string, unknown>>, {
      href: target,
      onClick: stay,
    })
  ) : (
    <a href={target} onClick={stay}>
      {children}
    </a>
  );
};

const router = { push: () => {}, replace: () => {}, back: () => {} };

export { router };
export const useRouter = () => router;
export const useLocalSearchParams = () => ({});
