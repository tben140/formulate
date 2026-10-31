import {
  availableFirst,
  CampaignByHandleQuery,
  campaignEndsLabel,
  campaignParagraphs,
  campaignStartFor,
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
import { CampaignEnds } from "@/components/campaign-ends";
import { CampaignSeen } from "@/components/campaign-seen";
import { ProductCard } from "@/components/product-card";
import { StorefrontErrorState } from "@/components/storefront-error";
import { campaignView } from "@/lib/campaign";
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
  // An email-only offer is kept out of search engines and link previews.
  if (campaign.audience === "email_link")
    return { title: campaign.title, robots: { index: false, follow: false } };
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

  const view = await campaignView();
  const status = campaignStatus(campaign, view);
  const products =
    status === "active"
      ? // Sold-out products last: the page shouldn't lead with one.
        availableFirst(result.data.metaobject?.products?.reference?.products.nodes ?? [])
      : [];
  const paragraphs = campaignParagraphs(campaign.body);

  return (
    <article>
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: campaign.title }]} />
      {status === "active" ? <CampaignSeen handle={campaign.handle} /> : null}

      <header className="grid gap-6 md:grid-cols-2 md:items-center">
        <div>
          {status === "restricted" ? null : <CampaignBadge label={campaign.badge} />}
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-balance">
            {campaign.headline}
          </h1>
          <p className="mt-2 text-foreground-muted">
            {status === "upcoming" ? (
              campaignStartsLabel(campaign, campaignStartFor(campaign, view))
            ) : status === "active" ? (
              <CampaignEnds
                endsAt={campaign.endsAt.toISOString()}
                label={campaignEndsLabel(campaign)}
                now={view.now.getTime()}
                clockPreview={view.clockPreview}
              />
            ) : status === "restricted" ? (
              "This offer is for our email subscribers. Open it from the link in your email."
            ) : (
              "This offer has ended."
            )}
          </p>
          {status === "upcoming" || status === "active" ? (
            <div className="mt-4 space-y-3">
              {/* The offer itself, always: `body` is optional. */}
              <p className="text-lg font-semibold">{campaign.offer}</p>
              {paragraphs.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
          ) : (
            <Link href="/" className="mt-4 inline-block underline underline-offset-4">
              Shop the range
            </Link>
          )}
          {status === "ended" ? (
            <p className="mt-4">
              Want the next offer first?{" "}
              <a href="#email-signup" className="underline underline-offset-4">
                Sign up for our emails
              </a>
              .
            </p>
          ) : null}
          {(status === "upcoming" || status === "active") && campaign.subscriberPerk ? (
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
