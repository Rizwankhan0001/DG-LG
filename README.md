# Dhampur Green Grow

A complete local web application for finding and developing hospitality sales opportunities for Dhampur Green. Built around **Delhi NCR, Mumbai, and Bengaluru**, with ten Indian cities and eight buyer categories.

## Public Vercel preview

Live preview: **https://dhampur-green-grow.vercel.app**

The Vercel deployment serves the frontend and a read-only API with the 303 versioned research records and product catalogue. The preview supports browsing, filters, product opportunities and the workflow guide. It does not save CRM changes, run discovery or automations, or send messages. No local database, private notes or `.env` file is uploaded. See [DEPLOYMENT.md](DEPLOYMENT.md) for deployment details and the full backend requirements.

## Start locally

Requires Node.js 22.

```bash
npm install
cp .env.example .env
npm run dev
```

Open **http://127.0.0.1:5173**. The API runs at **http://127.0.0.1:3001**.

No external keys are needed to browse and work with the researched starter businesses. Local development without an administrator password is accessible only through the default loopback binding. Configure `ADMIN_PASSWORD` to require sign-in locally as well.

The app opens in **Real businesses** with **303 researched business locations** across nine markets, including 88 in Delhi NCR, 65 in Mumbai and 65 in Bengaluru. Records include official source links, research dates and public contacts where found. These are researched prospects, not confirmed buyers. A separate **Sample workspace** contains 45 fictional businesses for practice; its records and drafts stay separate and sample emails cannot be sent.

Each lead now includes a **Product opportunity** brief: suggested applications, catalogue products, a possible purchasing role, buyer questions, and an editable monthly quantity scenario. The calculator supports sachets, kilograms and litres, shows its formula and saves assumptions per lead. Estimates are explicitly unconfirmed and never populate booked revenue. The **How it works** page explains the five-step sales process with an interactive walkthrough. Directory filters include contact availability and brand, and the real directory includes 59 phone records and 14 email records.


## What is implemented

| Area | Capabilities |
| --- | --- |
| Daily actions | India-time due/upcoming follow-ups, prospects to review, direct links to specific drafts, and completed contact-update counts |
| Contact history | Record calls/emails/meetings, outcomes, sales stage and next date in one form; no external contact is made by logging |
| Dashboard | Four-step workflow, actual business/shortlist/contacted/follow-up counts, city browsing, next actions, upcoming follow-ups and data sources |
| Discovery | 16 official directory connectors, city/category filters, up to 500 additions, 24-hour source cache, limits, durable jobs and branch deduplication |
| Data accuracy | Coverage dashboard, unique contact counts, field-level evidence, source differences with reviewed acceptance, unchanged CRM history |
| Google checks | Optional live Places API checks in each profile; results are not saved in the CRM or sent to AI |
| Lead directory | Search, city/category/product/score/stage filters, sort, pagination, grid/table views, shortlist, manual entry, selected CSV export |
| Imports | CSV import up to 500 rows, per-row validation, duplicate reporting, template download, formula-safe export |
| Qualification | Explainable product-fit estimates, field-level research evidence, contact-purpose notes and a Qualify & shortlist action |
| Contact enrichment | Optional Hunter Domain Search for published generic business emails; missing emails stay missing |
| Sales CRM | Seven pipeline stages, drag-and-drop, owner, estimated monthly value, follow-up date, notes and contact preferences |
| Outreach | OpenAI Responses API personalization with structured output; honest catalogue-template fallback without keys; editable drafts |
| Sending | Reviewed live drafts through Resend, verified sender configuration, durable outbox state, idempotency keys, daily caps, unsubscribe suppression |
| Automations | Daily/weekly discovery, optional automatic email enrichment, fit scoring and up to 20 drafts per run; enable/pause/delete/run now; persistent history |
| Catalogue | 15 real, curated Dhampur Green products, local product imagery, category uses and buyer matches; resync script |
| Reporting | Market breakdown, product fit signals, export, interactive planning assumptions and monthly customer targets |
| Access | Administrator login, hashed credentials, expiring database-backed sessions, HttpOnly cookies, request-origin checks, rate limiting |
| Delivery | Responsive frontend, Express API, persistent SQLite database, Dockerfile, Compose configuration, Caddy example and CI |

## Data refresh and AI grounding

Open **Data & accuracy** to see coverage, missing contacts and source status. **Check sources & add up to 500** queues a refresh. The scheduled worker must be running. Supported connectors cover Theobroma bakeries in nine markets and Blue Tokai cafés in Delhi; they do not cover every hotel, restaurant or caterer. Existing manually researched records remain available. The feed is weighted toward one bakery chain and is not representative of India's hospitality market.

New public records can also be packaged with `npm run research:refresh`. This script operates on an isolated temporary database and never exports private CRM notes. Read `data/research-refresh-report.json` for the last packaged run. It excludes incomplete addresses, conflicting full addresses and branches outside a directory's city. Refreshes preserve buyer notes and contact edits; published differences need human acceptance in the Sources tab.

OpenAI receives selected catalogue descriptions and linked published business facts with dates. Missing purchase quantities and buyer intent are explicitly unknown. This is source-grounded prompting, not training or fine-tuning a model. Google results are never included. AI request limits use `DAILY_AI_LIMIT`; no live model call has been validated without an account key.

## Keys and access needed for live use

Set these in **`.env`** or your host's secret manager. Keep secrets out of Git and browser code. Restart the server after changes. Settings shows whether variables are present; a live request verifies provider credentials and billing.

| Service | Environment variables | Purpose |
| --- | --- | --- |
| **Google Cloud** | `GOOGLE_PLACES_API_KEY` | Optional current-listing checks. Official directory discovery needs no key. Enable **Places API (New)** and billing for Google checks. Restrict the key to the API and server where possible. |
| **OpenAI** | `OPENAI_API_KEY`, `OPENAI_MODEL` | Optional AI pitches and product recommendations. Default configurable model: `gpt-4.1-mini`; choose a Responses-compatible model available to your account. |
| **Hunter** | `HUNTER_API_KEY` | Optional public business email lookup for a lead's website domain. |
| **Resend** | `RESEND_API_KEY`, `OUTREACH_FROM`, `OUTREACH_ENABLED=true` | Optional actual sending. Verify your domain and sender in Resend first. |
| **Your team** | `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Production administrator login. Use a unique password of at least 12 characters. |
| **Your host/domain** | `APP_URL`, `HOST`, `DATABASE_PATH` | Public HTTPS URL, persistent storage, DNS and hosting access for deployment. |

Example sender: `OUTREACH_FROM=Dhampur Green <sales@your-verified-domain.com>`. Set `OUTREACH_REPLY_TO` to your monitored business mailbox. Replies go there; this release does not ingest replies or delivery webhooks.

For better commercial planning, update your priority cities, trade pack sizes, minimum order quantities, shipping coverage and B2B prices with your sales team. Public retail prices in the catalogue are **not wholesale quotes**. No Shopify administrator access is needed for the public catalogue snapshot.

Provider setup: [Google Places](https://developers.google.com/maps/documentation/places/web-service/text-search), [OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [Hunter Domain Search](https://hunter.io/api-documentation/v2#domain-search), [Resend sending](https://resend.com/docs/api-reference/emails/send-email).

## Daily workflow

1. **Find businesses:** start with the researched records. Use a city card or the directory filters to narrow by city, buyer type and product. Open **Find more businesses** for official directory refreshes, or use **Data & accuracy** to inspect coverage and refresh up to 500 locations.
2. **Review fit:** open a profile, read its product suggestions and **Sources** tab, then use **Qualify & shortlist**. A published reservations address is an initial route into a business, not a confirmed purchasing contact.
3. **Reach out:** confirm who handles purchasing, then prepare a draft. Review the wording and recipient in **Outreach** before sending through a configured sender. Without an OpenAI key, drafts use an explicitly labelled catalogue template.
4. **Follow up:** open **Today’s actions** for due and upcoming conversations. After a call, email or meeting, use **Log contact** to record the outcome, choose a sales stage and set the next date. The **History** tab retains each update; **Notes** remains available for general research. Logging does not place a call or send a message.

To automate the first steps, create a daily or weekly routine in **Automations**. Hunter can find missing emails; OpenAI can personalize drafts. Each scheduled run adds up to 30 new locations from supported official directories and optionally prepares up to 20 drafts above your chosen fit threshold.

The worker checks the persistent job queue every three seconds. The first scheduled run is 24 hours after creation; subsequent runs are every 24 hours or seven days. **Run now** starts a routine immediately without changing its cadence. Pause stops future scheduling; a previously queued run can still finish. Run one API/worker process per database. An interrupted discovery is marked failed with partial results preserved. Re-running deduplicates records already saved.

## Data and assumptions

- The starter dataset was researched on **18, 21 and 22 September 2026** from official business websites. Locations are counted separately, including multiple branches of a chain. See [data/RESEARCH.md](data/RESEARCH.md) for sources and limits. Seeding is idempotent and preserves CRM edits on restart.
- Source evidence is stored per field on researched records. Changing a contact removes its old evidence and labels it user-provided; missing phones, emails and ratings are left blank. The app does not continuously re-check these website pages.
- Sources and source timestamps are retained on each lead. Google Maps attribution and listing links are displayed for Google-sourced businesses. Provider data retention and use must fit your provider licence; review it before deploying a shared lead database.
- Product scoring is deterministic and explainable; it is **not an AI prediction of purchase probability**. AI summaries are explicitly distinguished from category templates.
- External AI sees business name, city, category and relevant catalogue/settings data. Notes and phone numbers are not included in AI requests. OpenAI calls use `store: false`.
- Neither contact names nor business emails are invented. Hunter returns published addresses, which should still be checked for relevance and deliverability.
- New live leads begin with a zero/unestimated deal value. User-entered opportunity values and the reporting scenario are planning assumptions. Won value is not collected revenue; accounting/invoicing is outside this release.
- Demo discovery uses deterministic sample names so repeated runs demonstrate duplicate handling.
- No external outreach is sent during setup or testing. Automated routines prepare drafts; sending requires the user's action in the application.
- The application has a single administrator workspace, not separate user accounts, tenant billing or role-based permissions. These can be added if multiple independent sales teams are needed.

## Sending and recovery

Sending checks the recipient, sample flag, configuration, review flag and suppression list before contacting Resend. It reserves a daily attempt and stores `sending` state before the network call. The exact payload and idempotency key remain stable for retries. A failed submitted message cannot be edited; retries are limited to 23 hours to stay within the provider's usual 24-hour idempotency window. Check provider settings for the applicable policy.

If the process stops while a draft is `sending`, it is deliberately not automatically retried. Check the Resend dashboard for the `grow-draft-<id>` idempotency key before reconciling the draft's status. This avoids sending a duplicate when delivery is uncertain. Provider acceptance is labeled as submission, not delivery. Unsubscribe links use random per-recipient tokens, require a confirmation and suppress subsequent sending across matching email addresses.

Defaults: **100 Google search requests**, **50 Hunter lookups**, and **30 email attempts** per UTC day. Change `DAILY_DISCOVERY_LIMIT`, `DAILY_ENRICHMENT_LIMIT` and `DAILY_EMAIL_LIMIT` in the server environment. Provider billing and account limits also apply. Hunter and OpenAI use their provider billing; keep provider-level spending limits appropriate to your usage.

## Production deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) for the prepared Railway and Render configurations, required account access, persistent storage and verification commands. The Settings screen shows current setup status; local configuration does not mean the site is publicly deployed.

Use an always-on Linux host with Docker, persistent storage, and a public domain. This SQLite/scheduler architecture is not suitable for ephemeral serverless functions or multiple independent replicas.

1. Copy `.env.example` to `.env`, fill in the provider variables you need, and set:

   ```dotenv
   APP_URL=https://grow.your-domain.com
   ADMIN_EMAIL=you@dhampurgreen.com
   ADMIN_PASSWORD=replace-with-a-long-unique-password
   ```

2. Build and start:

   ```bash
   docker compose up --build -d
   docker compose logs -f grow
   ```

3. Point your subdomain's DNS at the host. Put Caddy or another HTTPS reverse proxy in front of `127.0.0.1:3001`; `Caddyfile` is an example for a Caddy installation on the host. Replace its example domain with the same domain as `APP_URL`.
4. The production server refuses to start without a 12-character administrator password and an HTTPS `APP_URL`. Sessions use secure cookies in production. Keep the backend port bound to loopback behind your proxy.
5. Verify sign-in, live discovery, your configured quotas, and a reviewed test email to an address you control before your first campaign.

Compose stores SQLite in the named `grow-data` volume at `/app/storage/grow.db`. The public catalogue snapshot is separately packaged in `/app/data/catalog.json`.

### Database backups

Set `BACKUP_DIR` to enable daily snapshots; the default retention is seven. Run `npm run backup` for an on-demand snapshot. Snapshots use SQLite’s online backup API and owner-only file permissions. Backups on the same volume should also be copied to separate storage.

For a local running database, use SQLite's online backup API rather than copying just the `.db` file while WAL writes are active:

```bash
node --input-type=module -e "import Database from 'better-sqlite3'; const db=new Database('data/grow.db'); await db.backup('data/grow-backup.db'); db.close();"
```

Inside the container, substitute `/app/storage/grow.db` and a backup path in the mounted storage, then copy the backup to a separate protected location. Restore with the application stopped. Backups contain business contacts and should be access-controlled.

## Catalogue sync

```bash
npm run catalog:sync
```

This refreshes the 15 curated products from the public Shopify catalogue and stores images locally. It preserves the manually curated product-to-buyer mappings. Restart the API to reload the snapshot. The product prices, variant names and timestamps shown come from the source; no trade price is assumed.

## Validation

```bash
npm run build
npm test
npx playwright install chromium
npm run test:e2e
npm run verify:production
```

Latest local validation: production build passed; 22 backend tests and 16 desktop/mobile browser tests passed. The isolated production check also passed, including protected sign-in and persistence after restart.

Backend tests use in-memory databases and mocked external provider responses; they never send real email or consume service credits. Browser tests run their own frontend/API on ports **5174/3002** and use a temporary database. Tests cover sample/live isolation, deduplication, CSV validation and export, CRM persistence, source preservation, quotas, authentication, draft sending safeguards, desktop/mobile navigation and complete workflows.

Live provider credentials, a cloud deployment, domain DNS and actual deliverability have not been validated without your accounts. Build configuration and local frontend/API workflows are testable immediately.

## Project structure

```text
src/                 React/TypeScript application and responsive styles
server/app.ts        HTTP API, authentication and sending controls
server/db.ts         SQLite persistence, usage counters and duplicate keys
server/service.ts    Discovery jobs, scheduling and draft orchestration
server/providers.ts  Google Places, Hunter and OpenAI adapters
server/scoring.ts    Explainable qualification and export escaping
shared/types.ts      Shared data contracts
data/catalog.json    Real, curated Dhampur Green products
data/researched-leads.json  Officially sourced starter prospects
server/research.ts   Idempotent starter data import and evidence
public/              Local product images, fonts and brand icon
tests/               API and browser workflow tests
scripts/             Catalogue sync, fonts and UI inspection
```

Docker is not installed in the development environment used for this build, so the container build has not been executed here.

The research and initial market strategy are in [BUSINESS_ANALYSIS.md](BUSINESS_ANALYSIS.md).
