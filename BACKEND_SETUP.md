# Dhampur Green: backend setup and proposed database design

Prepared 21 September 2026. This is a configuration and migration guide. The running application still uses SQLite; PostgreSQL and Supabase Auth have not been connected or implemented.

## Recommended production setup

- Supabase Pro: managed PostgreSQL, team authentication after integration, and database backups.
- Railway: the existing Node/Express app, compiled React frontend and an always-on background process. Keep one application replica with the current scheduler. Multiple workers require transactional job claiming first.
- Your own subdomain, such as `grow.dhampurgreen.com`, pointing to the app host.
- Keep the application and database geographically close. Singapore on both providers is a practical starting point for this architecture. Supabase also offers Mumbai; hosting the database there alone does not keep all application processing in India.

Current entry pricing is Supabase Pro from USD 25/month and Railway Pro USD 20/month minimum usage, including USD 20 of resource usage. Combined base: USD 45/month before extra usage, API services and taxes. This is not a fixed total bill. Free/development plans can be used for evaluation; check pausing and backup limitations before using them for daily sales operations.

Sources: [Supabase pricing](https://supabase.com/pricing), [Railway pricing](https://railway.com/pricing), [Supabase regions](https://supabase.com/docs/guides/platform/regions), [Railway regions](https://docs.railway.com/deployments/regions).

## What the current application actually needs

`.env.example` is a template. Real local values belong in `.env`, which the server loads through dotenv. In production put values in Railway's service Variables. Restart/redeploy after changing values. Do not put secrets in the frontend, a Git repository or chat.

| Capability | Configuration | When needed |
| --- | --- | --- |
| Administrator sign-in | `ADMIN_EMAIL`, unique `ADMIN_PASSWORD` of at least 12 characters | Before public deployment |
| Public address | `APP_URL=https://grow.dhampurgreen.com` or the assigned HTTPS address | When deployed |
| Network binding | `HOST=0.0.0.0`; use the host's assigned `PORT` | When deployed |
| Current SQLite storage | `DATABASE_PATH=/app/storage/grow.db` with a persistent volume at `/app/storage` for the included Railway Docker configuration | Until the PostgreSQL migration |
| Current backups | `BACKUP_DIR=/app/storage/backups`, `BACKUP_RETENTION=7`, plus an off-host backup | While SQLite is used in production |
| Refresh supported official directories | No API key; `WORKER_ENABLED=true` | Ready locally |
| Check current Google listings | `GOOGLE_PLACES_API_KEY`; Google Cloud project with billing and Places API (New) enabled | Optional live lookup; no result persistence |
| AI drafts | `OPENAI_API_KEY`, `OPENAI_MODEL` available to that API project | Optional; catalogue templates already work |
| Find published company emails | `HUNTER_API_KEY` | Optional; may return a shared address, not a purchasing decision maker |
| Send to opted-in contacts | `RESEND_API_KEY`, `OUTREACH_FROM`, `OUTREACH_REPLY_TO`, `OUTREACH_POSTAL_ADDRESS`, verified sending domain | Opt-in enforced in bulk campaigns and individual sends |
| Allow reviewed sending | `OUTREACH_ENABLED=true` | Keep false during initial setup |
| Background jobs | `WORKER_ENABLED=true` on an always-on service | To process discovery jobs and scheduled routines |
| Usage limits | `DAILY_DISCOVERY_LIMIT`, `DAILY_ENRICHMENT_LIMIT`, `DAILY_EMAIL_LIMIT` | Start low and monitor actual provider usage |

`DAILY_DISCOVERY_LIMIT` counts Google API requests, not individual leads or rupees. Use provider quotas as well; the application's limits are not a complete spending cap. A configured key is not proof it is valid: check with a small actual request.

OpenAI's API needs an API-project key and available API billing/credits. The current code uses the Responses API and defaults to `gpt-4.1-mini`; use a compatible model available in your account. Changing models requires checking structured-output compatibility, cost and results.

Sources: [Google Places billing and field masks](https://developers.google.com/maps/documentation/places/web-service/usage-and-billing), [OpenAI API setup](https://developers.openai.com/api/docs/quickstart), [Hunter API](https://hunter.io/api-documentation/v2), [Resend domain verification](https://resend.com/docs/dashboard/domains/introduction).

## Two production changes required by the provider choices

1. **Google Places content:** The old persistent importer has been replaced by a live-only listing comparison in the Sources tab. Results use `Cache-Control: no-store`, remain out of the CRM and AI input, and display attribution. Discovery now imports independently sourced official-directory facts. Add public terms/privacy notices and review the intended Google use before production; this architecture change is not a compliance certification.
2. **Email sending:** Resend prohibits cold outreach and requires recipients to opt in. Publicly finding an email and manually reviewing a message do not establish opt-in. Bulk campaigns and individual sends now enforce recorded, address-specific email opt-in and suppression server-side. Record permission in a lead profile or import your existing permission records through Bulk campaigns. Campaign emails include your postal address and an unsubscribe link. Cold prospecting needs a separately evaluated workflow/provider and an appropriate integration; it is not enabled by adding a Resend key.

Sources: [Google Places policies](https://developers.google.com/maps/documentation/places/web-service/policies), [Resend acceptable use](https://resend.com/legal/acceptable-use).

## Business information to supply

The public shop catalogue is not a complete wholesale sales catalogue. Supply a spreadsheet with:

- Product SKU, exact pack size, sachet count or weight, case quantity and product specifications.
- Wholesale price, tax treatment supplied by your finance team, minimum order, delivery charges and serviceable cities.
- Current stock or capacity, dispatch time, payment terms and sample policy.
- Approved certificates, claims and product documents that sales staff may share.
- Existing customers, contacts, contact permissions, sales history and previous order quantities where available.
- Salesperson names, territory ownership, preferred sender identity and a monitored reply mailbox.

Actual order history and buyer-confirmed usage will improve quantity estimates more than merely increasing the directory size. Retail prices and default calculator inputs must not become customer-specific wholesale quotes automatically.

## Database model to implement in PostgreSQL

Use separate related tables for information that needs filtering, permissions or reporting. Reserve JSONB for flexible assumptions and provider payloads whose storage is permitted. Do not reproduce the current all-purpose `entities` JSON table as the whole production design.

| Tables | Main information and relationships |
| --- | --- |
| `workspaces`, `memberships` | Dhampur Green workspace, authenticated users, owner/manager/salesperson roles |
| `companies`, `locations` | Brand/company, individual outlets, city, locality, buyer category; one company can have many locations |
| `contacts`, `contact_assignments` | Business email/phone, person or role, shared-contact scope, verification, company or outlet assignment |
| `sources`, `business_facts` | Source URL/provider, the specific fact, observed date, verification state and permitted retention |
| `products`, `product_variants`, `trade_prices` | Product, exact pack/unit, effective wholesale prices, MOQ and minimum case quantity |
| `leads` | Sales owner, pipeline stage, shortlist state, company/location relationship, created and updated times |
| `product_matches` | Lead, product/use case, suggested rationale, supporting facts and method version |
| `demand_scenarios`, `scenario_items` | Lead, product or alternative-product group, low/high quantities, units, service days, assumptions and version history |
| `buyer_requirements` | Requirements actually confirmed by the buyer, product/unit, quantity, date and confirmation evidence |
| `activities`, `followups` | Calls, meetings, notes, outcomes, due dates, task owner and completion status |
| `drafts`, `message_attempts`, `contact_permissions`, `suppressions` | Draft revisions, reviewed payload, delivery identifiers, retries, opt-in evidence and do-not-contact state |
| `deals`, `deal_items`, `orders`, `order_items` | Proposed business, quoted products, confirmed orders and actual ordered quantities; estimates stay separate |
| `automations`, `jobs`, `usage_events`, `audit_events` | Schedules, job attempts/claims, errors, provider usage and who changed important records |

Example relationship: one Blue Tokai company can have many café locations. A central purchasing contact can be attached to the company and linked to multiple outlets, without copying the same person into every branch. A chain-wide deal should not be counted once per location.

Design rules:

1. Give each record a stable ID and foreign keys. Scope private business records to the workspace, with matching workspace constraints on cross-table links.
2. Add unique constraints for provider + external ID where appropriate. Use normalized name/address/domain for possible-duplicate review; domain alone cannot identify a branch.
3. Index city/category, stage/owner, follow-up due date and provider identifiers. Paginate and filter in SQL instead of downloading every lead to the browser on each refresh.
4. Use decimal quantities and explicit units. Never add kilograms, litres and sachets together. Store INR amounts as integer paise or fixed-precision numeric values.
5. Give confirmed buyer requirements their own records. A scenario can have a method and assumptions without becoming a factual purchase requirement.
6. Retain important status changes and send attempts as separate records. Use database transactions and unique idempotency keys to prevent duplicated jobs and emails on retries.
7. Introduce individual team logins. Apply workspace and role checks in the API; use appropriate PostgreSQL grants and RLS on exposed Supabase tables. Privileged server connections can bypass RLS, so RLS alone is not an authorization design.
8. Use database migrations, separate staging and production environments, backups and a tested restoration procedure. Back up uploaded files separately from database backups.

Sources: [Supabase access controls](https://supabase.com/docs/guides/database/postgres/row-level-security), [database connections](https://supabase.com/docs/guides/database/connecting-to-postgres), [backup scope](https://supabase.com/docs/guides/platform/backups).

## Supabase credentials: only after backend migration

The application currently reads `DATABASE_PATH`, not `DATABASE_URL`. Adding a Supabase URL today does not migrate or connect the database.

For the proposed version, obtain the database connection string from the project's **Connect** dialog and put it in a server-side `DATABASE_URL`. Choose a direct or session-pooler connection appropriate to the always-on Node host's network support, and require verified TLS. Use a dedicated restricted runtime database role; reserve migration privileges for migrations.

If Supabase Auth is integrated, also configure the project URL and publishable key, login redirect URLs and invite flow. A service/secret key is only needed for operations that require it and must remain server-side. Do not assume a Supabase service key and a PostgreSQL connection password are interchangeable.

## Implementation order

1. Finalize the wholesale product sheet, sales users and monthly service budget. Create the hosting/database accounts in Dhampur Green's ownership.
2. Create a development Supabase project. Implement the relational schema, storage adapter and team access controls; write an import from a SQLite backup preserving IDs, sources, notes and follow-ups.
3. Compare migrated record counts and values, check permissions and restore a backup in staging. Implement job claiming and the provider-content/consent changes above.
4. Deploy the app to Railway, connect the production database, set the public URL and add the subdomain DNS record without replacing the main website.
5. Configure provider secrets, run a small discovery and draft check, and use a controlled opted-in recipient for any sending test. Start with one city/category and a small schedule.
6. Watch failed jobs, duplicate rates, contact quality, sample requests, confirmed orders and provider spend. Increase the schedule based on these results.

The current SQLite setup remains an option for a small single-instance pilot with a persistent volume and off-host backups while this migration is built.

## Bulk campaign setup

See [CAMPAIGNS.md](CAMPAIGNS.md) for the email and WhatsApp keys, permission import format, queue behaviour, limits and recovery instructions. The public Vercel deployment remains read-only; adding sending keys to that preview does not activate a persistent worker.
