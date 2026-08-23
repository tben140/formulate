# Double Helix — UK & US Markets implementation

> Status: market-content and catalogue implementation brief. It is not a
> substitute for a UK food-law review, US regulatory review, or manufacturer
> label approval.

## Principle: shared product, local legal presentation

Create each Double Helix item once in Shopify. Keep its handle, product ID,
variant SKUs, images, inventory, Recharge selling plans, and collection logic
shared across the UK and US. This is the source of truth for commerce.

Then customise the market-facing legal and commercial details:

| Shared globally | Localised by market |
| --- | --- |
| Product handle, title, image gallery, option names, variant SKUs, inventory, tags, collections, filters, Recharge plan structure | Price and currency, product availability, description, SEO copy, legal statement of identity, warnings, nutrition panel, label artwork, country-specific claims and use directions |

Shopify Markets catalogs can set product availability and fixed market prices;
Translate & Adapt can provide distinct content for a market even when the
language is English in both markets. The **physical pack** still needs a
market-specific approved label. A Shopify localisation does not replace label
law.

## Neutral global product titles

Use these titles in Shopify. They are deliberately ingredient- and format-led
so the same product can be sold in both markets without embedding an outcome
claim in the canonical name.

| SKU | Global Shopify title | UK legal descriptor | US legal descriptor |
| --- | --- | --- | --- |
| DH-VD3-001 | Vitamin D3 | Vitamin D3 food supplement | Vitamin D3 dietary supplement |
| DH-CZ-002 | Vitamin C + Zinc | Vitamin C and zinc food supplement | Vitamin C and zinc dietary supplement |
| DH-MULTI-003 | Daily Multivitamin | Multivitamin and mineral food supplement | Multivitamin and mineral dietary supplement |
| DH-MAG-004 | Magnesium Glycinate | Magnesium food supplement | Magnesium dietary supplement |
| DH-FOCUS-005 | Citicoline + L-Theanine Daily Sticks | Citicoline and L-theanine food supplement | Citicoline and L-theanine dietary supplement |
| DH-THEAN-006 | L-Theanine | L-theanine food supplement | L-theanine dietary supplement |
| DH-LION-007 | Lion's Mane Mushroom | Lion's mane mushroom food supplement | Lion's mane mushroom dietary supplement |
| DH-CITI-008 | Citicoline | Citicoline food supplement | Citicoline dietary supplement |
| DH-COQ10-009 | CoQ10 + Vitamin E | Coenzyme Q10 and vitamin E food supplement | Coenzyme Q10 and vitamin E dietary supplement |
| DH-VESEL-010 | Vitamin E + Selenium | Vitamin E and selenium food supplement | Vitamin E and selenium dietary supplement |
| DH-LIVE-011 | Live Cultures | Live-culture food supplement | Live-culture dietary supplement |
| DH-FIBRE-012 | Fibre Powder | Fibre food supplement powder | Fibre dietary supplement powder |
| DH-FISH-013 | Omega-3 Fish Oil | Omega-3 fish oil food supplement | Omega-3 fish oil dietary supplement |
| DH-ALGAE-014 | Omega-3 Algae Oil | Omega-3 algae oil food supplement | Omega-3 algae oil dietary supplement |
| DH-CREA-015 | Creatine Monohydrate | Creatine monohydrate food supplement | Creatine monohydrate dietary supplement |
| DH-WHEY-016 | Whey Protein | Whey protein food supplement powder | Whey protein dietary supplement powder |
| DH-PLANT-017 | Plant Protein | Plant protein food supplement powder | Plant protein dietary supplement powder |
| DH-ELEC-018 | Electrolyte Powder | Electrolyte food supplement powder | Electrolyte dietary supplement powder |
| DH-COLL-019 | Marine Collagen | Marine collagen food supplement powder | Marine collagen dietary supplement powder |
| DH-TURM-020 | Turmeric Curcumin | Turmeric food supplement | Turmeric dietary supplement |

Do not use benefit- or disease-led terms such as `Brain Boost`, `Neuro Repair`,
`Regenerate`, `Anti-Ageing`, `Stem Cell Support`, or `Longevity` in a global
title, handle, image label, or primary collection name.

## Market-specific content

### United Kingdom market

- Currency: GBP; use the draft prices in the catalogue only until commercial
  pricing and VAT are confirmed.
- Use the legal descriptor **food supplement**.
- Use only claims authorised in the Great Britain nutrition and health claims
  register, with the exact conditions of use and required supporting label
  information.
- Use UK spellings and UK food-business contact details.
- The product page's `Warnings & interactions` module must match the approved
  UK pack warning and the manufacturer-approved formula.
- Keep `Mind & Focus` and `Cellular` as editorial navigation only until a food
  regulatory reviewer signs off their use and any supporting authorised claim.

### United States market

- Currency: USD; set a fixed price per product/variant in the US market catalog
  rather than relying on converted GBP prices.
- Use the legal descriptor **dietary supplement** and an approved US
  `Supplement Facts` panel.
- US structure/function or general-wellbeing claims require substantiation,
  the required FDA disclaimer, and an FDA notification within 30 days after the
  first marketing of that claim. They must not imply diagnosis, treatment,
  cure, or prevention of disease.
- Use US spellings, units, responsible-party address, directions, and warning
  text approved for the US label.
- Do not assume that an ingredient, dose, claim, or certification cleared for
  the UK is cleared for the US; confirm each item and its form with the
  manufacturer and US regulatory adviser.

## Shopify configuration

1. Create `United Kingdom` and `United States` country markets.
2. Create a draft catalog for each market: `Double Helix UK` and `Double Helix
   US`.
3. Assign only products whose formula, label, and claims are approved for that
   market. Products not approved for a market stay excluded from its catalog.
4. Set GBP prices in the UK catalog and explicit USD prices in the US catalog;
   document the price rationale, rather than using a hidden exchange-rate rule.
5. Add English to both Markets and use Translate & Adapt market customisations
   for product descriptions, legal descriptors, warnings, SEO descriptions,
   and market-specific promotional copy.
6. Build product-page fields as metafields rather than burying compliance data
   in rich text: `market_uk.*` and `market_us.*` for descriptor, directions,
   warnings, claims, label reference, and panel reference. The theme selects
   only the fields for the active market.
7. Publish the approved Recharge selling-plan group to both markets only after
   checking its currency, prepaid, customer-portal, and cancellation behaviour
   in each context.
8. Before launch, use Shopify's product `View as` market preview to confirm the
   intended price, availability, content, and subscription option in the UK and
   the US.

## Claim guardrail

Global product titles are intentionally restrained. Benefit messaging belongs
in a market-specific field with an audit record:

| Field | Requirement |
| --- | --- |
| `claims.uk.authorised` | Exact authorised GB claim, condition of use, supporting nutrient and source |
| `claims.us.structure_function` | Exact claim, substantiation owner, FDA-notification status, disclaimer reference |
| `compliance.market_status` | Draft, approved, or excluded per market |
| `labels.uk_artwork` / `labels.us_artwork` | Approved print artwork reference—not generated creative imagery |

### Examples

| Collection or page concept | UK-market copy only after qualification | US-market copy only after substantiation |
| --- | --- | --- |
| Mind & Focus | “Pantothenic acid contributes to normal mental performance.” | A substantiated structure/function statement with FDA disclaimer |
| Cellular | “Vitamin E contributes to the protection of cells from oxidative stress.” | A substantiated structure/function statement with FDA disclaimer |
| Performance | Use only authorised nutrient claims where formula conditions are met | Use only substantiated non-disease language with FDA disclaimer |

## Market launch gates

Do not publish a product in either market until all of these are complete:

- Formula, ingredient form, dose, allergen statement, and manufacturing
  evidence verified for that market.
- Market-specific physical label approved.
- Market-specific legal descriptor, directions, warnings, and nutrition panel
  approved.
- Claims reviewed against the GB register or US substantiation/notification
  requirements.
- USD/GBP price, tax, fulfilment, and subscription terms tested.
- Market catalog, product availability, and Shopify/Recharge customer portal
  previewed in the relevant context.

## References

- [Shopify Markets catalogs](https://help.shopify.com/en/manual/markets/customizations/catalogs)
- [Shopify market-specific content](https://help.shopify.com/manual/markets/languages/translate-adapt-app)
- [UK nutrition and health claims guidance](https://www.gov.uk/government/publications/nutrition-legislation-information-sources/nutrition-legislation-information-sheet--2)
- [FDA dietary-supplement statement of identity](https://www.fda.gov/food/dietary-supplements-guidance-documents-regulatory-information/dietary-supplement-labeling-guide-chapter-ii-identity-statement)
- [FDA structure/function claims](https://www.fda.gov/food/nutrition-food-labeling-and-critical-foods/structurefunction-claims)
