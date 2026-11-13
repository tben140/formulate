import { isPolicyHandle, ShopPoliciesQuery } from "@formulate/shopify";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Breadcrumbs } from "@/components/breadcrumbs";
import { StoreHtml } from "@/components/store-html";
import { StorefrontErrorState } from "@/components/storefront-error";
import { storefront } from "@/lib/storefront";

interface PageProps {
  readonly params: Promise<{ handle: string }>;
}

// The root layout's title template adds " — <brand>".
export const metadata: Metadata = { title: "Policy" };

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
      <StoreHtml html={policy.body} className="mt-6" />
    </article>
  );
};

export { PolicyPage as default };
