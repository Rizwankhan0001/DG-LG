# Ingredient buyer research

The primary workspace is **Ingredient buyers**, which opens with one card per company. Compact cards show ingredient matches, the top sourced person and contact readiness. Clicking a card opens the company’s full evidence and approach plan. **View all products** opens that company’s searchable range; selecting a product shows its published ingredients, Dhampur Green matches and buying-potential tools. Company and product links survive reloads. The separate **Product matches** view remains available.

[Daily cloud research](DAILY_RESEARCH.md) targets ten new sourced firms at 09:15 IST and publishes validated public research through GitHub and Vercel. The website reports actual additions and shortfalls. This is separate from the private backend scheduler.

**Download Excel** beside the results exports a real `.xlsx` workbook. Choose **Current filtered results** or **All researched companies**. The **Companies** sheet has one row per firm with public email/phone, contact pages, separately labelled purchasing contacts, matching products and ingredients, suggested Dhampur products, qualification stages and saved notes. **Product matches** retains every recorded ingredient match for the selected products, with sources, dates and review status. **Contact people** lists sourced names, roles, departments, person-specific business emails where published, evidence limits and suggested approach. **Contact routes** lists company emails/phones with purpose and source. **Export notes** records the scope and filters. Unknown values stay blank. Sheets have frozen headers and Excel filters. Downloads work in both the private workspace and the public preview, using only the data available in that view.

## What is included

- 27 supplier catalogue products; 7 ingredient families mapped to relevant raw-material products.
- 1,184 sourced product profiles across 63 companies/brands. The original 33 reviewed profiles are preserved; 1,151 profiles need review. This is a research set, not a nationwide census or a count of unique legal buyers or recipes.
- Product source URLs, official product images, ingredient text, exact published percentages where available, check dates and direct/component distinctions.
- 60 named public professional leads across 30 companies: 8 procurement, 8 product development, 7 operations, 9 sales and 28 leadership roles. Company pages, public LinkedIn sources and two explicitly unverified directory entries retain their individual evidence. General company routes are separate: 115 published emails/phones, deduplicated within each company. Only two person-specific emails were sourced; no missing email is guessed.
- Saved notes, shortlist, qualification stages, verified professional contacts and quantity scenarios on the private backend.
- Reviewed direct matches and a user-verified buyer contact can create one deduplicated **Food manufacturers** sales lead. No email/WhatsApp permission or buyer demand is inferred. The campaign audience uses those evidence-linked product IDs, rather than every manufacturing product.

Search now includes professional names and roles. Filter companies with procurement, R&D, sales or leadership contacts. Sort by company name, research date, matching product count, people count or purchasing contacts first; product view sorts by title and source date. Inside a company, people can be filtered by role/source and sorted by title, name, check date or company evidence. Suggested approach text distinguishes direct purchasing questions from technical trials and referral requests. A check date is not confirmation of employment.

Run `npm run research:export` to regenerate the public [Excel workbook](data/ingredient-buyers.xlsx), [people CSV](data/buyer-contacts.csv), [business routes CSV](data/buyer-contact-routes.csv) and product CSV. The standalone exporter never reads private CRM data. The in-app download retains all sourced people at the selected firms, including additional roles.

## The simple workflow

1. Find a company or filter by supplier ingredient. Open the company’s products, then inspect a matching product.
2. Open its published ingredient source. A component match, such as khand inside couverture chocolate, requires finding the component manufacturer.
3. In **Buying potential**, enter packs/month, pack weight, recipe percentage, ingredient yield and proposed supply share.
4. In **Purchasing team**, confirm manufacturing responsibility, identify the professional buyer and record a source for their current role.
5. Add the qualified company to sales. Use existing samples, follow-up, outreach and bulk campaigns after recording appropriate contact permissions and connecting sending services.

The calculation is packs × grams/pack ÷ 1,000 × ingredient percentage ÷ yield percentage × supply share. A 10,000-pack, 700 g, 16% jaggery recipe at 100% yield and 25% share illustrates 280 kg/month. Production and share are **assumptions**, not disclosed orders. Unknown ingredient percentages stay blank; we never derive jaggery share by subtracting peanut content, cocoa percentage or nutrition-panel sugar totals. Manufacturing losses, recipe basis and bulk specifications need buyer confirmation.

## Automation and additional coverage

**Bulk public research export:** the September 29 expansion inspected 6,800 catalogue listings and 2,439 cached product pages across 97 candidate sources (67 returned public catalogues). Download `data/ingredient-buyers.csv` for company, product, published ingredients, direct/component matches, suggested Dhampur products, source links and public contacts. The source-by-source results and gaps are in `data/ingredient-refresh-report.json`; see [data/BUYER_RESEARCH.md](data/BUYER_RESEARCH.md). The September 30 enrichment adds company pages, public LinkedIn evidence, and selected Flipkart, Instamart, Zepto, BigBasket, Blinkit and JioMart sources. Public business emails are now available for 59 companies and phones for 45. Amazon searches/access produced no usable imported evidence. See `data/buyer-enrichment-report.json`; these remain public leads rather than verified purchasing contacts.

Run `npm run research:buyers -- --pages` to append additional source-backed profiles from the registered public sources. `--company=mapro,cookie-man` limits the run to selected registered companies; `--offline` rebuilds from the ignored local research cache. The exporter reads up to four 250-listing feed pages and attempts up to 250 missing product pages per company, uses a 24-hour feed cache, records source failures, and retains existing research. It never reads `.env` or the CRM database, never sends outreach, and never turns search snippets into ingredient evidence. Image-only labels and inaccessible catalogues remain coverage gaps. This CLI is separate from the private worker's seven existing catalogue connectors below.

**Official catalogue scans:** no API key. The private worker reads up to 250 public product listings per selected, fixed allowlisted company. It extracts ingredient sections, adds new matches as **Needs review**, and flags changed ingredients for review. Some stores publish ingredient panels only on the full product page; their existing reviewed evidence is retained when the feed cannot supply it. A failed source retains the previous evidence and displays a warning. Scans do not fabricate new brands, contacts or missing ingredients.

**Nationwide discovery:** optional `TAVILY_API_KEY`. Research centre accepts ingredient, product category and city/market, and can search indexed Amazon.in pages. Results retain the actual URLs and excerpts but are candidate sources, not verified product/ingredient facts. Check the product label and manufacturer, then use **Review & add product evidence**. Location is a search preference, not inferred company geography. There is no direct Amazon API or crawler integration.

Enable daily research to refresh selected catalogues every 24 hours. Optionally include one nationwide search with the selected inputs. Default server limits are 20 catalogue requests and 10 nationwide search requests per UTC day. These are request caps, not monetary budgets. Provider account allowances apply. Daily scheduling starts 24 hours after enabling; run a scan/search immediately using its own button.

The search adapter uses Tavily’s documented fixed HTTPS endpoint, basic general search, India preference, up to 20 results, and no generated answer/raw HTML: [Tavily Search API](https://docs.tavily.com/documentation/api-reference/endpoint/search), checked 29 September 2026. No model training is performed. Ingredient recognition and priority scoring are explainable rules; the existing optional AI introduction writer remains separate.

## Backend setup

The public Vercel site is a **read-only research preview**. It includes only versioned public research and catalogue assets. It cannot save company data, run background work or send messages.

For actual operation use the existing persistent Express deployment described in [BACKEND_SETUP.md](BACKEND_SETUP.md) and [DEPLOYMENT.md](DEPLOYMENT.md): one always-on process, SQLite on a persistent volume, HTTPS `APP_URL`, strong `ADMIN_PASSWORD`, and backups. Set `WORKER_ENABLED=true` for scans and schedules. Collections `buyer_companies`, `buyer_products`, `supplier_materials`, `buyer_workspaces`, `ingredient_runs`, `ingredient_searches`, and `ingredient_settings` use the existing transactional SQLite store and backups. Restart recovery marks interrupted jobs failed; preserved results can be scanned again. Local CRM data is never published to GitHub or the public preview.

Optional settings in `.env.example`:

```dotenv
DAILY_INGREDIENT_REQUEST_LIMIT=20
TAVILY_API_KEY=
DAILY_INGREDIENT_SEARCH_LIMIT=10
```

No key is required to explore the supplied research or run supported catalogue scans privately. Resend/WhatsApp keys are only for the existing sending features. Add secrets to the private host’s environment, never the browser or GitHub.

Dhampur Green still needs to confirm manufacturer-grade specifications, certifications/test documents, bulk packs, MOQ, available capacity and trade pricing. Published retail packs/prices are references, not bulk quotes or supply guarantees.

## Source provenance

Company sources are in `data/buyer-companies.json`; product label sources, image attribution, check dates and ingredient evidence are in `data/buyer-products.json`. Supplier mappings are in `data/supplier-materials.json`. Retail supplier products link to dhampurgreen.com. Published addresses are contact locations, not confirmed factory sites. A listing sold out at the check date does not establish that manufacturing has ceased.

Validation passed for this expansion: production build, all 61 backend/unit tests, all 50 desktop/mobile browser tests, and the production authentication and persistence check. Offline sorting, workbook, evidence and seed-preservation checks also passed. The test suites cover ingredient negation/component handling, avoiding nutrition/marketing false matches, quantity arithmetic, source failures, deduplication, contact qualification, private persistence, public write blocking, search limits, and desktop/mobile workflows. Test searches and contacts use fixtures; tests do not send outreach or use live provider credentials.
