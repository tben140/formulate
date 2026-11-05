import Link from "next/link";

export type Crumb = {
  readonly label: string;
  /** Omitted for the current page, the last crumb. */
  readonly href?: string;
};

/**
 * A breadcrumb trail (SHO-60), following the WAI-ARIA breadcrumb pattern: a
 * labelled `nav` holding an ordered list, with the current page marked
 * `aria-current="page"` and not linked. The separators are decoration, hidden
 * from screen readers, which announce the list structure instead.
 */
export const Breadcrumbs = ({ items }: { readonly items: readonly Crumb[] }) => (
  <nav aria-label="Breadcrumb" className="mb-6 text-sm">
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-foreground-muted">
      {items.map((crumb, index) => (
        <li key={crumb.href ?? crumb.label} className="flex items-center gap-2">
          {index > 0 ? <span aria-hidden="true">›</span> : null}
          {crumb.href ? (
            <Link
              href={crumb.href}
              className="underline-offset-4 hover:text-foreground hover:underline"
            >
              {crumb.label}
            </Link>
          ) : (
            <span aria-current="page" className="text-foreground">
              {crumb.label}
            </span>
          )}
        </li>
      ))}
    </ol>
  </nav>
);
