import { isPolicyHandle, ShopPoliciesQuery } from "@formulate/shopify";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Breadcrumbs } from "@/components/breadcrumbs";
import { StorefrontErrorState } from "@/components/storefront-error";
import { storefront } from "@/lib/storefront";

interface PageProps {
  readonly params: Promise<{ handle: string }>;
}

export const metadata: Metadata = { title: "Policy — Double Helix" };

/**
 * A store policy (privacy, subscription and so on), as written in Shopify
 * admin → Settings → Policies. The footer's Legal menu links here, at the same
 * `/policies/<handle>` path the Liquid theme uses, so a menu item works on
 * both.
 */
const PolicyPage = async ({ params }: PageProps) => {
  const { handle } = await params;
  if (!isPolicyHandle(handle)) notFound();

  const result = await storefront.request(ShopPoliciesQuery, {});
  if (!result.ok) return <StorefrontErrorState error={result.error} />;

  const { shop } = result.data;
  const policy = [
    shop.privacyPolicy,
    shop.refundPolicy,
    shop.termsOfService,
    shop.shippingPolicy,
    shop.subscriptionPolicy,
  ].find((candidate) => candidate?.handle === handle);
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
