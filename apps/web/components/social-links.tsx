import { SOCIAL_LINKS } from "@formulate/tokens/social";

/**
 * The brand's social accounts, as icon links in the footer. The list, its
 * placeholder URLs and the icon paths are shared with the app and the theme
 * (packages/tokens/src/social.ts).
 */
export const SocialLinks = () => (
  <nav aria-label="Social media">
    {/* -ml-3 lines the first icon up with the text above: each 20px icon sits
        centred in a 44px tap target. */}
    <ul className="-ml-3 flex flex-wrap gap-2">
      {SOCIAL_LINKS.map((link) => (
        <li key={link.id}>
          <a
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={link.label}
            className="flex size-11 items-center justify-center rounded-full text-foreground-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5 fill-current">
              <path d={link.path} />
            </svg>
          </a>
        </li>
      ))}
    </ul>
  </nav>
);
