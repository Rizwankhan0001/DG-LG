# Daily company discovery

The GitHub workflow [Daily company research](https://github.com/Rizwankhan0001/DG-LG/actions/workflows/daily-buyers.yml) runs at **09:15 IST every day** (`45 3 * * *` UTC). GitHub may delay scheduled jobs. It also supports **Run workflow** and runs when its workflow configuration changes on `main`, so installation can be verified immediately. It works while the local computer is off.

The target is **10 distinct new firms per India calendar day**. This is an evidence-gated target, not a guarantee of ten qualified buyers or a model-training process. The project updates its sourced research dataset. On a shortfall, it publishes the actual count and reasons instead of padding the list with duplicates or weak matches.

## What qualifies

- A public company website and evidence of an Indian business/market.
- At least one active product listing with an explicit ingredient list and a direct match to a supplied ingredient.
- A published business email or phone route on the official site.
- No duplicate company domain, product ID or source URL. Search-discovered websites also require a matching own-brand product vendor/brand; a retailer listing another brand is held back.
- New ingredient evidence is **Needs review**. Ingredient use does not establish current purchasing intent, volume or authority. Brand profiles may still share a parent company or a contract factory; confirm the legal buyer before approaching.

The process reads up to 250 feed listings per company, up to ten selected product pages and four contact/about pages. It rejects recipes, unsupported ingredient claims, raw-sweetener retail listings and inaccessible sources. Existing reviewed products and private CRM records are preserved. Local databases and `.env` are never read by the daily CLI.

## Company contacts

Business contact routes stay separate from named people. No email patterns, personal phone lookups or inferred purchasing authority are generated. Structured named-person data needs an explicit employer/role association. Manually researched associations in `data/buyer-people-sources.json` are imported only if their exact evidence is found again on the official page. Historical articles retain their age and current-role limitations.

Compact cards show the company, ingredient matches, best sourced contact and evidence readiness. Clicking a card opens its full products, business contact routes, source evidence and next qualification step. The “Ingredient label + business contact” filter and readiness sort help prioritize research. “Copy approach brief” prepares a sourced introduction brief; it sends nothing. The Excel export includes this brief and the remaining qualification questions.

## Discovery and limits

Without a search key, discovery checks the registered backlog in `data/buyer-sources.json` and `data/daily-research-sources.json`. This backlog is finite. Wider continuous discovery needs **`TAVILY_API_KEY` in GitHub Actions repository secrets**. A key only in local `.env` does not configure the cloud job. [Add repository secrets](https://github.com/Rizwankhan0001/DG-LG/settings/secrets/actions).

With the key configured, up to four basic Tavily requests discover new official-source candidates per run. Search snippets never become ingredient or person evidence. Defaults per run: 35 company candidates, 300 public-page requests, four search requests. Retries/manual runs can incur additional provider usage; these limits are request bounds, not a monetary cap. No new paid account is provisioned. Failed sources are retained for follow-up, with a six-day interval between attempts. Unprocessed candidates remain eligible when the page budget is exhausted.

To run locally with public websites only:

```bash
npm run research:daily
npm run research:export
```

The CLI intentionally does not load `.env`. Use an explicitly supplied process environment if you want provider discovery locally. Never put an API key in a command history, source file or chat.

## Publication and verification

After collection, the workflow regenerates Excel/CSV, builds the application, runs the backend/unit tests and desktop/mobile browser tests, and commits only the listed public research files to `main`. Its `GITHUB_TOKEN` needs `contents: write`. The existing Vercel Git integration handles deployment; an optional `VERCEL_BUYER_DEPLOY_HOOK` Actions secret can trigger deployment if that integration does not handle automated commits. The workflow verifies the live revision and dataset counts and fails visibly if publication does not complete.

The live report is `data/daily-research-report.json`, rendered on the website. `data/DAILY_RESEARCH.md` records the latest run’s outcomes; state retains 30 daily summaries. Successful public page responses are retained as GitHub Actions artifacts for 14 days. The workflow never sends email, WhatsApp or LinkedIn messages.

The public Vercel website remains read-only. This cloud job is separate from the seven-catalogue private backend scheduler in Research centre. Pause the cloud process with **Disable workflow** in GitHub Actions. Repository inactivity can disable scheduled workflows; monitor the run history and the website’s latest-run date. [GitHub schedule behavior](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).

## APIs to improve coverage

See [API recommendations and integration status](API_RECOMMENDATIONS.md). Start with Tavily for continuous discovery; consider Apollo for role-based people research and Hunter for business-email discovery and verification. None establishes buying intent or purchasing authority.
