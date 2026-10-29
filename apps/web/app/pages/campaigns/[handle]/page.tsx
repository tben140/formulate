import {
  CampaignByHandleQuery,
  campaignEndsLabel,
  campaignParagraphs,
  campaignStartsLabel,
  campaignStatus,
  priorityIndex,
  toCampaign,
} from "@formulate/shopify";
import { Image } from "@shopify/hydrogen-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";

import { Breadcrumbs } from "@/components/breadcrumbs";
import { CampaignBadge } from "@/components/campaign-badge";
import { ProductCard } from "@/components/product-card";
import { StorefrontErrorState } from "@/components/storefront-error";
import { now } from "@/lib/campaign";
import { baseOpenGraph } from "@/lib/site";
import { storefront } from "@/lib/storefront";

interface PageProps {
  readonly params: Promise<{ handle: string }>;
}

const getCampaign = cache(async (handle: string) =>
  storefront.request(CampaignByHandleQuery, { handle }),
);

export const generateMetadata = async ({ params }: PageProps): Promise<Metadata> => {
  const { handle } = await params;
  const result = await getCampaign(handle);
  const campaign = result.ok ? toCampaign(result.data.metaobject) : null;
  if (!campaign) return {};
  return {
    title: campaign.headline,
    description: campaign.offer,
    alternates: { canonical: `/pages/campaigns/${campaign.handle}` },
    openGraph: {
      ...baseOpenGraph,
      url: `/pages/campaigns/${campaign.handle}`,
      title: campaign.headline,
      description: campaign.offer,
      ...(campaign.image ? { images: [{ url: campaign.image.url }] } : {}),
    },
  };
};

/**
 * A campaign's landing page (SHO-169), at the path Shopify gives the
 * theme's metaobject page, so a shared link works on both.
 *
 * Before the campaign it says when it starts; afterwards that it has ended.
 * Shared links keep working, and nothing claims an offer that isn't running.
 */
const CampaignPage = async ({ params }: PageProps) => {
  const { handle } = await params;
  const result = await getCampaign(handle);
  if (!result.ok) return <StorefrontErrorState error={result.error} />;

  const campaign = toCampaign(result.data.metaobject);
  if (!campaign) notFound();

  const status = campaignStatus(campaign, now());
  const products =
    status === "active"
      ? (result.data.metaobject?.products?.reference?.products.nodes ?? [])
      : [];
  const paragraphs = campaignParagraphs(campaign.body);

  return (
    <article>
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: campaign.title }]} />

      <header className="grid gap-6 md:grid-cols-2 md:items-center">
        <div>
          <CampaignBadge label={campaign.badge} />
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-balance">
            {campaign.headline}
          </h1>
          <p className="mt-2 text-foreground-muted">
            {status === "upcoming"
              ? campaignStartsLabel(campaign)
              : status === "active"
                ? campaignEndsLabel(campaign)
                : "This offer has ended."}
          </p>
          {status !== "ended" ? (
            <div className="mt-4 space-y-3">
              {paragraphs.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
          ) : (
            <Link href="/" className="mt-4 inline-block underline underline-offset-4">
              Shop the range
            </Link>
          )}
          {status !== "ended" && campaign.subscriberPerk ? (
            <p className="mt-4 rounded-lg border border-border p-3 text-sm">
              <strong className="font-semibold">Subscribers:</strong>{" "}
              {campaign.subscriberPerk}.
            </p>
          ) : null}
        </div>
        {campaign.image ? (
          <div className="overflow-hidden rounded-lg bg-surface-muted">
            <Image
              data={campaign.image}
              sizes="(min-width: 768px) 45vw, 90vw"
              className="h-auto w-full"
              loading="eager"
              fetchPriority="high"
            />
          </div>
        ) : null}
      </header>

      {products.length > 0 ? (
        <section aria-labelledby="campaign-products" className="mt-10">
          <h2 id="campaign-products" className="text-xl font-semibold">
            In the {campaign.badge} offer
          </h2>
          <ul className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
            {products.map((product, index) => (
              <li key={product.id}>
                <ProductCard
                  product={product}
                  sizes="(min-width: 768px) 22vw, 45vw"
                  headingLevel="h3"
                  priority={!campaign.image && index === priorityIndex(products)}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="campaign-terms" className="mt-10 max-w-3xl">
        <h2 id="campaign-terms" className="text-base font-semibold">
          Terms
        </h2>
        <p className="mt-2 text-sm whitespace-pre-line text-foreground-muted">
          {campaign.terms}
        </p>
      </section>
    </article>
  );
};

export { CampaignPage as default };
