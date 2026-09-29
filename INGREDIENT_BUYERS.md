# Ingredient buyer research

The primary workspace is **Ingredient buyers**. It links Dhampur Green raw materials to other brands’ published product ingredients, then helps qualify the factory, purchasing person and volume.

## What is included

- 27 supplier catalogue products; 7 ingredient families mapped to relevant raw-material products.
- 33 sourced product profiles across Early Foods, True Elements, Sweet Karam Coffee, The Good Kind, The Snack Company, Slurrp Farm and Tots & Moms. This is a starting research set, not a nationwide census.
- Product source URLs, official product images, ingredient text, exact published percentages where available, check dates and direct/component distinctions.
- Company contact routes, contact locations where sourced, procurement/R&D roles to ask for, qualification questions and one explicitly unverified professional directory lead. General customer-service addresses are not purchasing contacts.
- Saved notes, shortlist, qualification stages, verified professional contacts and quantity scenarios on the private backend.
- Reviewed direct matches and a user-verified buyer contact can create one deduplicated **Food manufacturers** sales lead. No email/WhatsApp permission or buyer demand is inferred. The campaign audience uses those evidence-linked product IDs, rather than every manufacturing product.

## The simple workflow

1. Select a supplier ingredient and inspect a matching buyer product.
2. Open its published ingredient source. A component match, such as khand inside couverture chocolate, requires finding the component manufacturer.
3. In **Buying potential**, enter packs/month, pack weight, recipe percentage, ingredient yield and proposed supply share.
4. In **Purchasing team**, confirm manufacturing responsibility, identify the professional buyer and record a source for their current role.
5. Add the qualified company to sales. Use existing samples, follow-up, outreach and bulk campaigns after recording appropriate contact permissions and connecting sending services.

The calculation is packs × grams/pack ÷ 1,000 × ingredient percentage ÷ yield percentage × supply share. A 10,000-pack, 700 g, 16% jaggery recipe at 100% yield and 25% share illustrates 280 kg/month. Production and share are **assumptions**, not disclosed orders. Unknown ingredient percentages stay blank; we never derive jaggery share by subtracting peanut content, cocoa percentage or nutrition-panel sugar totals. Manufacturing losses, recipe basis and bulk specifications need buyer confirmation.

## Automation and additional coverage

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

The test suites cover ingredient negation/component handling, avoiding nutrition/marketing false matches, quantity arithmetic, source failures, deduplication, contact qualification, private persistence, public write blocking, search limits, and desktop/mobile workflows. Test searches and contacts use fixtures; tests do not send outreach or use live provider credentials.
