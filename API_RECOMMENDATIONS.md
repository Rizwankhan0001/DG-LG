# APIs for better company and contact research

Recommended order: **Tavily → Apollo → Hunter**. Provider data still needs a company/domain match, a source date and a clear distinction between a published contact and a verified buyer. No provider establishes current purchase intent or guarantees ten new suitable firms daily.

| API | What it improves | Current project support |
| --- | --- | --- |
| [Tavily Search](https://docs.tavily.com/documentation/api-reference/endpoint/search) | Discover additional company websites, product ingredient pages and public professional-profile sources. Official pages must then pass the evidence checks. | Implemented in the daily cloud collector. Add `TAVILY_API_KEY` to this repository’s GitHub Actions secrets. |
| [Apollo People Search](https://docs.apollo.io/reference/people-api-search) and [People Enrichment](https://docs.apollo.io/reference/people-enrichment) | Search by employer and titles such as procurement, purchasing, sourcing and R&D; enrich matching people with professional details. Search itself does not return emails or phones. Domain search can include previous employers, so current employment must be checked. | Not integrated yet. Confirm your account has the required API endpoints before buying a plan. Enrichment uses credits depending on the endpoint and options. |
| [Hunter Domain Search and Email Verifier](https://hunter.io/api-documentation/v2) | Find sourced business emails and check deliverability. Catch-all or unknown results must remain uncertain; deliverability does not prove identity, role or buying authority. | Domain Search is implemented in the private CRM through `HUNTER_API_KEY`. Daily company/person enrichment and Email Verifier need an additional integration. |

For this project, the first useful key is **Tavily**: [GitHub Actions secret settings](https://github.com/Rizwankhan0001/DG-LG/settings/secrets/actions). The scheduled process cannot read a key stored only in your local `.env`. Leave keys out of chat, Git commits and browser-side `VITE_` variables. Adding an Apollo or Hunter secret alone will not enable an unimplemented daily integration.

Start with a small credit allowance and test coverage against a representative sample of your Indian food-company targets before expanding spending. See [Tavily pricing](https://docs.tavily.com/documentation/api-credits) and [Apollo API access and credits](https://docs.apollo.io/docs/api-pricing) for current account requirements. The daily collector currently allows four basic Tavily searches per run; manual retries can use additional credits.

LinkedIn public profile links can support research, but a normal LinkedIn API key does not grant a general people-search database. Its sales integrations require approved SNAP partner access. See [LinkedIn API access](https://learn.microsoft.com/en-us/linkedin/shared/authentication/getting-access). Do not supply your LinkedIn password or session cookies.

For genuinely warmer leads, record actual signals in the private CRM: a reply, a sample request, an ingredient specification, expected monthly volume or a requested quote. Keep that confirmed interest separate from ingredient fit and contact completeness.
