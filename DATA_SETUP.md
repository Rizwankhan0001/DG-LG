# Data and AI setup

## Use it now without keys

Run `npm run dev`, open http://localhost:5173, and choose **Data & accuracy**. The packaged research contains 303 locations from official business websites. **Check sources & add up to 500** reads the supported brand directories and saves new locations. The worker must stay running. A refresh does not promise 500 new leads; existing locations are checked without duplication.

Coverage: Theobroma bakeries across nine markets and Blue Tokai cafés in Delhi NCR, plus the earlier individually researched cafés, restaurants, hotels and bars. Restaurants, caterers, sweet shops and distributors do not yet have automated directory connectors. No single chain is a representative sample of India's hospitality market. Chain buying may be centralized.

Each source is read at most once every 24 hours by the app, with a default cap of 40 source requests per UTC day. Failures are visible and do not delete saved leads. Full street addresses copied under conflicting branch names, incomplete records and addresses outside the selected city are excluded. Existing sales stages, notes, quantities and edited contact details are preserved. In **Sources**, compare changed facts and accept only the details you have reviewed.

## Optional Google and OpenAI connections

Add keys to the local `.env` or your hosting provider's server-side secret settings, then restart the API. Never commit keys or put them in frontend variables.

```dotenv
GOOGLE_PLACES_API_KEY=
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4.1-mini
DAILY_DISCOVERY_LIMIT=100
DAILY_AI_LIMIT=50
DAILY_RESEARCH_LIMIT=40
```

- **Google:** enable Places API (New) and billing. Open a real lead → Sources → Check Google listing. Up to three possible matches are displayed with attribution. Check the address yourself. Results are not saved in the CRM, put in a cache or supplied to AI. A successful lookup validates the key; a configured indicator only detects its presence. Public terms/privacy notices and a review of your intended provider usage are still needed before production.
- **OpenAI:** use a project API key with API billing/credits and an available Responses-compatible model. Open a real lead → Prepare outreach. The model receives selected catalogue descriptions and linked published facts with check dates. Missing demand and purchasing roles remain unknown in the supplied context. Structured output is validated and unknown product IDs are discarded. AI prose still needs human review; this does not make it verified business evidence.
- **Without OpenAI:** catalogue templates continue working and are labelled as templates.
- **Hunter, optional:** `HUNTER_API_KEY` enables domain-based public company-email searches. A returned address can serve many outlets and may not reach purchasing. It is not proof of opt-in or deliverability. Do not automatically contact collected addresses.

The limits above count requests, not rupees. Configure provider-side budgets and quotas as well. No Google or OpenAI call was verified with a live account key during this build. The network integrations were checked with mocked provider responses; official-directory retrieval was exercised against the actual public websites.

## What “AI training” means here

This version supplies current evidence with each AI request; it does not train or fine-tune a model. It does not feed Google Maps content into AI. Actual usage quantities, existing suppliers, willingness to switch and purchasing authority cannot be established from a public listing. Record them after speaking to the buyer. Requirement calculators remain clearly labelled scenarios.

## GitHub and hosting

Target repository: https://github.com/Rizwankhan0001/DG-LG

Git excludes `.env`, local databases, backups, Vercel credentials and build/test output. The current app uses SQLite and an always-on worker. Vercel cannot persist that database unchanged. Full Vercel hosting requires a remote database and adapting jobs to supported scheduling, or a separately hosted persistent backend with the frontend on Vercel. Do not publish just `dist` and expect CRM operations to work.

Vercel's Hobby plan is for personal, non-commercial use. No paid plan or database has been purchased by this build. See [DEPLOYMENT.md](DEPLOYMENT.md) for the existing persistent-server options and [BACKEND_SETUP.md](BACKEND_SETUP.md) for the proposed PostgreSQL migration.

Sources: [Google Places policies](https://developers.google.com/maps/documentation/places/web-service/policies), [Google Maps terms](https://cloud.google.com/maps-platform/terms), [OpenAI structured output](https://developers.openai.com/api/docs/guides/structured-outputs), [Vercel SQLite limitations](https://vercel.com/kb/guide/is-sqlite-supported-in-vercel), [Vercel commercial-use guidance](https://vercel.com/docs/limits/fair-use-guidelines).
