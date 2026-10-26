import { isPolicyHandle, ShopPoliciesQuery } from "@formulate/shopify";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";

import { Breadcrumbs } from "@/components/breadcrumbs";
import { StorefrontErrorState } from "@/components/storefront-error";
import { baseOpenGraph } from "@/lib/site";
import { storefront } from "@/lib/storefront";
import { metaDescription } from "@/lib/structured-data";

interface PageProps {
  readonly params: Promise<{ handle: string }>;
}

type PolicyKey =
  | "privacyPolicy"
  | "refundPolicy"
  | "termsOfService"
  | "shippingPolicy"
  | "subscriptionPolicy";

/**
 * The shop's policies, fetched once per render for the page and its metadata
 * alike. The Storefront API is POST, which Next doesn't deduplicate by
 * itself, so without `cache` a visit would ask Shopify twice.
 */
const getPolicies = cache(() => storefront.request(ShopPoliciesQuery, {}));

/** The shop's policy at this handle, for the page and its metadata alike. */
const findPolicy = <P extends { readonly handle: string }>(
  shop: Readonly<Record<PolicyKey, P | null | undefined>>,
  handle: string,
): P | undefined =>
  [
    shop.privacyPolicy,
    shop.refundPolicy,
    shop.termsOfService,
    shop.shippingPolicy,
    shop.subscriptionPolicy,
  ].find((candidate): candidate is P => candidate?.handle === handle);

/**
 * The policy's own title ("Privacy policy — Double Helix"), a description from
 * its opening text, and a canonical. It shares the page's request for the
 * policies (`getPolicies`), so it costs no second call to Shopify.
 */
export const generateMetadata = async ({ params }: PageProps): Promise<Metadata> => {
  const { handle } = await params;
  if (!isPolicyHandle(handle)) return {};
  const result = await getPolicies();
  const policy = result.ok ? findPolicy(result.data.shop, handle) : undefined;
  if (!policy) return { title: "Policy" };

  // The body is HTML; the description wants its words only.
  const description = metaDescription(policy.body.replace(/<[^>]+>/g, " "));
  return {
    title: policy.title,
    ...(description ? { description } : {}),
    alternates: { canonical: `/policies/${handle}` },
    openGraph: {
      ...baseOpenGraph,
      url: `/policies/${handle}`,
      title: policy.title,
      ...(description ? { description } : {}),
    },
  };
};

/**
 * A store policy (privacy, subscription and so on), as written in Shopify
 * admin → Settings → Policies. The footer's Legal menu links here, at the same
 * `/policies/<handle>` path the Liquid theme uses, so a menu item works on
 * both.
 */
const PolicyPage = async ({ params }: PageProps) => {
  const { handle } = await params;
  if (!isPolicyHandle(handle)) notFound();

  const result = await getPolicies();
  if (!result.ok) return <StorefrontErrorState error={result.error} />;

  const policy = findPolicy(result.data.shop, handle);
  if (!policy) notFound();

  return (
    <article className="max-w-3xl">
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: policy.title }]} />
      <h1 className="text-3xl font-semibold tracking-tight">{policy.title}</h1>
      {/*
        The body is HTML the merchant wrote in Shopify admin: store content, not
        shopper input. The arbitrary variants style its unclassed elements,
        since Tailwind's preflight strips their defaults.
      */}
      <div
        className="mt-6 text-foreground-muted [&_a]:text-brand-600 [&_a]:underline [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-foreground [&_h3]:mt-6 [&_h3]:font-semibold [&_h3]:text-foreground [&_li]:mt-1 [&_ol]:mt-4 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:mt-4 [&_ul]:mt-4 [&_ul]:list-disc [&_ul]:pl-6"
        dangerouslySetInnerHTML={{ __html: policy.body }}
      />
    </article>
  );
};

export { PolicyPage as default };
