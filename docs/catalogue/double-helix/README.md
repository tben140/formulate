# Double Helix product catalogue — review draft

> Status: creative and merchandising draft only. Do not manufacture, print,
> publish, or import into Shopify until a suitably qualified UK food-regulatory
> reviewer and the contract manufacturer have approved every formula, claim,
> allergen statement, nutrition value, and label proof.

## Range direction

**Double Helix** is a science-led, quietly premium food-supplement brand for
professionals and athletes. The range balances daily essentials, stimulant-free
mind-and-focus formats, cellular nutrients, gut support, and performance
nutrition.

The range contains **20 parent products**. Every product is a 30-day supply;
where a physical product has variants, they represent a real shopper choice,
such as strength, flavour, or sweetening. The import file is intentionally
`DRAFT`, so it cannot accidentally appear in any sales channel.

Every gallery asset is square (1:1). This applies to both the packshot and the
lifestyle image, so product cards and mobile galleries can use one stable image
ratio without cropping a bottle, tub, or key context.

### Label foundations to retain on every final pack

- The product name includes "food supplement".
- The recommended daily portion is explicit.
- Include: "Do not exceed the stated recommended daily dose."
- Include: "Food supplements should not be used as a substitute for a varied,
  balanced diet and a healthy lifestyle."
- Include: "Keep out of reach of young children."
- The final label needs the responsible UK food-business name and address,
  net quantity, complete descending-weight ingredient list, highlighted
  allergens where present, and batch/best-before information.

Claims are intentionally excluded from this draft. Product names, collection
names, and editorial copy must be checked against the Great Britain nutrition
and health claims register before publication. Do not add disease-prevention,
treatment, cure, regeneration, anti-ageing, stem-cell, or similar claims.

`Mind & Focus` and `Cellular` are collection concepts, not permission to make
a health claim. In the UK, any customer-facing use that implies a benefit must
be paired with a relevant authorised claim and a formula meeting that claim's
conditions of use. For example: "Pantothenic acid contributes to normal mental
performance" or "Vitamin E contributes to the protection of cells from
oxidative stress".

## UK and US market model

Double Helix uses **one Shopify parent product and one stable handle per item**
across Markets. Product imagery, variant SKUs, inventory, reviews, collections,
and Recharge plans stay shared. The legal statement of identity, label artwork,
regulated copy, eligibility, and price are market-specific.

The global Shopify product title must be ingredient- and format-led; it should
not carry a health outcome. This avoids maintaining two near-duplicate products
and gives both Markets a durable identifier. `Food supplement` (UK) and
`Dietary supplement` (US) belong in each market's legal description and physical
label, not the shared product title.

See [UK & US Markets implementation](/Users/bentaylor/Desktop/formulate-shopify-project/docs/catalogue/double-helix/markets.md)
for the title matrix, content fields, catalog setup, and market launch gates.

## Product schedule — agreed direction

| SKU | Global Shopify title | 30-day format | Variant axis | Draft price | Collection memberships |
| --- | --- | --- | --- | ---: | --- |
| DH-VD3-001 | Vitamin D3 | 30 tablets | 25 µg, 50 µg | £9.95 | Daily Essentials |
| DH-CZ-002 | Vitamin C + Zinc | 30 tablets | None | £11.95 | Daily Essentials |
| DH-MULTI-003 | Daily Multivitamin | 30 tablets | None | £15.95 | Daily Essentials, Cellular |
| DH-MAG-004 | Magnesium Glycinate | 30 capsules | 200 mg, 375 mg | £17.95 | Daily Essentials, Mind & Focus |
| DH-FOCUS-005 | Citicoline + L-Theanine Daily Sticks | 30 stick packs | Berry, Citrus, Peach, Unflavoured; sweetened or unsweetened | £24.95 | Mind & Focus |
| DH-THEAN-006 | L-Theanine | 30 vegan capsules | None | £17.95 | Mind & Focus |
| DH-LION-007 | Lion's Mane Mushroom | 30 vegan capsules | None | £21.95 | Mind & Focus |
| DH-CITI-008 | Citicoline | 30 vegan capsules | None | £25.95 | Mind & Focus |
| DH-COQ10-009 | CoQ10 + Vitamin E | 30 softgels | None | £24.95 | Cellular |
| DH-VESEL-010 | Vitamin E + Selenium | 30 vegan capsules | None | £14.95 | Daily Essentials, Cellular |
| DH-LIVE-011 | Live Cultures | 30 vegan capsules | None | £19.95 | Gut Health |
| DH-FIBRE-012 | Fibre Powder | 30 servings powder | Unflavoured; sweetened or unsweetened | £14.95 | Gut Health |
| DH-FISH-013 | Omega-3 Fish Oil | 30-day softgels | Standard, High Strength | £18.95 | Cellular |
| DH-ALGAE-014 | Omega-3 Algae Oil | 30-day vegan softgels | None | £22.95 | Cellular |
| DH-CREA-015 | Creatine Monohydrate | 30 servings tub | Unflavoured | £21.95 | Performance |
| DH-WHEY-016 | Whey Protein | 30 servings tub | Vanilla, Chocolate, Strawberry; sweetened or unsweetened | £32.95 | Performance |
| DH-PLANT-017 | Plant Protein | 30 servings tub | Vanilla, Chocolate, Strawberry; sweetened or unsweetened | £29.95 | Performance |
| DH-ELEC-018 | Electrolyte Powder | 30 servings pouch | Citrus or Berry; sweetened or unsweetened | £19.95 | Performance |
| DH-COLL-019 | Marine Collagen | 30 servings pouch | Unflavoured | £25.95 | Performance |
| DH-TURM-020 | Turmeric Curcumin | 30-day vegan capsules | None | £16.95 | Performance |

### Ingredient-status note

The purpose and exact formula for every product is still draft. Before product
data is regenerated, each ingredient, extract type, dosage, and claim must be
checked by the manufacturer and food-regulatory reviewer. Citicoline is a
particularly useful demonstration case: it is authorised in Great Britain as a
novel food for food supplements at up to 500 mg/day and its label must say it
is not intended for children. That does not grant permission for cognitive or
medical claims. See the [FSA's citicoline authorisation](https://data.food.gov.uk/regulated-products/novel_authorisations/novel-34).

The prior `shopify-draft.csv` describes the superseded first range and must not
be imported. It will be replaced with a fully aligned v2 draft after the
product schedule, warning matrix, and packshot direction have been approved.

## Shopify collections

| Collection | Type | Membership rule |
| --- | --- | --- |
| Daily Essentials | Manual | Curated overlap shown in the product schedule |
| Mind & Focus | Manual | Curated stimulant-free cognitive-format range; UK claim review required |
| Cellular | Manual | Curated cellular-nutrient range; no implied medical benefit |
| Gut Health | Manual | Live Cultures and Daily Fibre |
| Performance | Manual | Sports and training-adjacent products |
| Best Sellers | Automated | Product tag `bestseller` |
| Vegan | Automated | Product tag `vegan` |

Initial `bestseller` tags: Magnesium Glycinate, Daily Multivitamin, Mind &
Focus Sticks, Creatine Monohydrate, Whey Protein, and Electrolyte Powder.

## Recharge purchase options

All products offer one-time purchase plus Recharge purchase options:

| Purchase option | Delivery | Charge timing | Draft discount |
| --- | --- | --- | ---: |
| Subscribe & Save | Every 30 days | Every 30 days | 10% |
| Two-month prepaid | Every 30 days | Two deliveries paid up front | 12% |
| Three-month prepaid | Every 30 days | Three deliveries paid up front | 15% |

Customers should be able to pause, skip, and cancel. The final policy must
explain how cancellation and any refund is handled once prepaid £0 shipment
orders have been queued by Recharge.

## Filters and warnings

Product data will provide filters for Vegan, Gluten-free, Dairy-free, Non-GMO,
Third-party tested, Informed Sport, GMP manufactured, Caffeine-free, and
Recyclable packaging. Attributes must reflect the individual formula: fish oil,
marine collagen, and whey remain intentional non-vegan examples; Informed Sport
is reserved for Creatine, proteins, and Electrolyte Powder.

Every product page should show a compact warnings-and-interactions panel. The
draft data will use only warnings genuinely relevant to the formula, including
medication consultation, pregnancy/breastfeeding, anticoagulants, kidney
conditions, immunocompromise, 18+ status, and declared allergens.

## Packaging concept for image review

The proposed visual system uses a warm off-white background, near-black
midnight-blue packs, a simple two-strand helix mark, and one high-chroma colour
per family:

| Family | Accent | Products |
| --- | --- | --- |
| Daily Essentials | electric teal | 001–004, 010 |
| Mind & Focus | violet | 005–008 |
| Cellular & Omega | cobalt blue | 009, 013–014 |
| Gut Health | amber | 011–012 |
| Performance | coral orange | 015–020 |

Packshots should be front-three-quarter, centred, with crisp studio lighting in
a square 1:1 frame. **Packshots are the next review stage.** Lifestyle images
and other gallery shots are deferred until the pack visual system is approved.
When generated, they should include the same product in a real, restrained UK
home or training context, also in a square 1:1 frame. They must never imply a
medical outcome, show a child, or place a supplement beside prescription
medicine.

## What still needs business input

The superseded CSV must be regenerated as a v2 *draft merchandising file*, not
verified regulatory artwork. Before a live Shopify import, supply or confirm:

1. Manufacturer-approved formula and active quantities for every SKU.
2. UK responsible-business address, country of origin where required, and
   approved barcode/GTIN allocation.
3. Stock location, tax treatment, shipping weight and fulfilment details.
4. Signed-off legal claims, ingredient order, allergen cross-contact wording,
   storage conditions, warnings, and best-before/batch process.
5. Final approved pack artwork. Generated imagery is a creative concept and
   cannot be used as the legal label.

## Source notes

The Food Supplements (England) Regulations require food supplements to be sold
under that name and to state the recommended daily portion plus specific dose,
diet, and child-reach warnings. UK FSA guidance also distinguishes supplements
from medicines; products must not claim to prevent, treat, or cure disease.
For the full legal and label review, see the
[Food Supplements Regulations](https://www.legislation.gov.uk/uksi/2003/1387/contents),
[FSA food-supplement guidance](https://www.food.gov.uk/business-guidance/chemical-safety),
and [FSA consumer safety guidance](https://www.food.gov.uk/news-alerts/news/new-year-new-guidance-fsa-helps-consumers-navigate-food-supplements-safely).
