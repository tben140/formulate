"use client";

import { useRouter } from "next/navigation";
import { useTransition, type FormEvent, type ReactNode } from "react";

import { useHydrated } from "@/lib/use-hydrated";

/**
 * A GET form that applies itself as it changes, once JavaScript runs: a
 * ticked box or a sort choice replaces the URL in place, without a reload or
 * a jump to the top. A price field applies on Enter or when you leave it (its
 * change event). Without JavaScript it is a plain form with a submit button.
 *
 * Empty fields are left out, as `withoutEmptyFilters` would tidy them. The
 * URL's #fragment is kept, so the phone filter sheet (`#filters:target`) stays
 * open while you choose.
 *
 * A results count beside the list is an `aria-live` region, so a screen
 * reader hears each change land (WCAG 3.2.2: the change is announced, and
 * focus stays where it was).
 */
export const AutoSubmitForm = ({
  action,
  className,
  children,
}: {
  action: string;
  className?: string;
  children: ReactNode;
}) => {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const apply = (form: HTMLFormElement) => {
    const params = new URLSearchParams();
    for (const [name, value] of new FormData(form)) {
      if (typeof value === "string" && value.trim() !== "") params.append(name, value);
    }
    const url = `${action}${params.size > 0 ? `?${params}` : ""}${window.location.hash}`;
    startTransition(() => router.replace(url, { scroll: false }));
  };

  return (
    <form
      method="get"
      action={action}
      className={className}
      aria-busy={pending || undefined}
      onChange={(event) => apply(event.currentTarget)}
      onSubmit={(event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        apply(event.currentTarget);
      }}
    >
      {children}
    </form>
  );
};

/** Shown only until JavaScript runs: the submit button AutoSubmitForm replaces. */
export const WithoutJs = ({ children }: { children: ReactNode }) =>
  useHydrated() ? null : children;

/** Shown only once JavaScript runs. */
export const WithJs = ({ children }: { children: ReactNode }) =>
  useHydrated() ? children : null;
