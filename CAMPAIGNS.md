# Bulk campaigns

Open **Bulk campaigns** in the sales workflow. Choose email or WhatsApp, city, buyer category, optional product and 50 / 100 / 150 / a custom number (1–500). This is a batch target, not a promise that enough contacts exist. The researched snapshot contains 303 locations, 13 distinct email addresses and no recorded marketing opt-ins. Shared contacts are deduplicated; missing contacts are not fabricated.

1. Review the ranked research shortlist and confirm the buyer's contact and interest. A recent “Interested” or “Sample requested” conversation ranks above a complete listing. Category fit +30, recent buyer interest +35, qualified/sample/negotiation stage +15, shortlist +5, recent source evidence +10, usable contact +5. These are research priorities, not purchase probabilities.
2. Record existing permission under a lead's **Permissions** tab. For a large existing list, **Export audience**, fill `optIn=yes` and `permissionSource` with actual evidence, then **Import opt-ins**. Required CSV columns: `leadId,channel,contact,optIn,permissionSource`. The exact address must still match the lead. Import is atomic, limited to 500 records and never sends anything. Opt-out history and unsubscribe blocks persist.
3. Review ready contacts, uncheck exclusions, edit the email introduction and inspect recipient previews. Email merge fields are `{{business}}`, `{{city}}`, `{{category}}`, `{{products}}`, `{{sender}}`, `{{company}}`. Templates use recorded facts; AI keys are not needed for bulk personalisation.
4. Save the batch with **Review messages**, inspect the saved audience, sender/footer and each personalised message, then check the review box and **Start batch**. Audience and content are frozen. Newly discovered leads never join a reviewed batch automatically.
5. Monitor the queue. **Pause** and **Cancel pending** affect pending recipients; an in-flight request may finish. Cancelled or completed batches cannot restart. Resume only processes pending recipients. Provider acceptance is not confirmed delivery, a reply or a sale. Check delivery and replies in provider dashboards and record buyer outcomes in the CRM.

## Private backend required

The Vercel site is a public read-only research preview. The full sending implementation runs in the existing Express application with persistent SQLite, protected login and one always-on worker. See [DEPLOYMENT.md](DEPLOYMENT.md). Keep one replica per database; automatic recovery assumes exclusive process ownership. Keys in Vercel's preview environment alone do not activate campaigns. No database migration to Supabase is included.

Set `ADMIN_EMAIL`, strong `ADMIN_PASSWORD`, public HTTPS `APP_URL`, persistent `DATABASE_PATH`, backups and `WORKER_ENABLED=true`. `APP_URL` must serve the backend unsubscribe and webhook routes. Provider access is server-side. Real keys belong in private host variables or the ignored local `.env`, never GitHub.

## Email / Resend

- `RESEND_API_KEY`: an API key with sending permission.
- `OUTREACH_FROM`: your verified sender, such as `Dhampur Green <sales@your-verified-domain>`.
- `OUTREACH_REPLY_TO`: a monitored reply inbox (optional).
- `OUTREACH_POSTAL_ADDRESS`: your real business postal address.
- `OUTREACH_ENABLED=true` after the sender is ready.
- `DAILY_EMAIL_LIMIT`: local cap on attempts, shared with individual outreach; default 30.

Campaigns append company name, postal address, opt-in explanation and a unique unsubscribe link. The sender identity is saved with the draft. If sender details change before starting/resuming, create a fresh draft to review them. Individual Outreach sends also enforce opt-in and suppressions. A public listing or a purchased/scraped list is not permission: [Resend acceptable use](https://resend.com/legal/acceptable-use).

## WhatsApp Business / Meta Cloud API

- `WHATSAPP_ACCESS_TOKEN`: your server access token with the relevant WhatsApp permissions.
- `WHATSAPP_PHONE_NUMBER_ID`: the registered sender's numeric ID.
- `WHATSAPP_API_VERSION`: a supported version for your Meta app, including the `v` prefix.
- `WHATSAPP_TEMPLATE_ID`: the numeric ID of an approved template.
- `WHATSAPP_APP_SECRET`: used to verify webhook signatures.
- `WHATSAPP_VERIFY_TOKEN`: a secret you choose for webhook verification.
- `WHATSAPP_ENABLED=true` and `DAILY_WHATSAPP_LIMIT` (default 30).

Subscribe Meta's **messages** webhook to `https://your-private-backend/api/webhooks/whatsapp`. GET verifies the challenge; POST verifies `X-Hub-Signature-256` against the raw request body before processing STOP / UNSUBSCRIBE / CANCEL / END / QUIT / STOPALL replies. These replies block that number across all leads. The backend does not invent intent from an inbound message or delivery receipt. Configure the webhook before starting WhatsApp campaigns and verify with your own opted-in test contact.

In **Bulk campaigns → WhatsApp → View connection steps**, select **Load approved Meta template**. The backend reads the template from Meta and accepts `APPROVED` text templates with a BODY and optional static FOOTER. Include “Reply STOP to opt out”. Supported body variables are `{{1}}` for business name and `{{2}}` for matched products. Static templates are supported. Media, headers, buttons, named parameters and additional variables are intentionally unsupported and rejected. Keep approved template content unchanged while a saved campaign is running; reload and create a new reviewed batch for content changes.

Template payload reference: [Meta WhatsApp templates](https://whatsapp.github.io/WhatsApp-Nodejs-SDK/api-reference/messages/template/). The referenced SDK is archived; this implementation calls Cloud API directly and uses your configured API version.

## Queue operation and recovery

- One recipient is claimed transactionally per worker tick (three seconds). Discovery can delay a tick; this is not an exact-time delivery scheduler.
- Daily caps are per UTC day. Remaining recipients wait until the next day, 05:30 IST. Use caps within your provider's own limits; this app does not override provider quotas, billing or approval requirements.
- Before each send: check current permission, unchanged destination, closed/suppressed status, opt-outs and recent sends. Contacts already accepted or in flight in the last seven days are excluded from new campaigns. Duplicate addresses are represented once, even across branches.
- Each email request has a unique [Resend idempotency key](https://resend.com/changelog/idempotency-keys). The frozen payload and provider receipt are stored with the recipient. API keys are never stored in these records.
- Provider rejection pauses the campaign. Network timeouts, malformed successful receipts, HTTP 5xx or a restart during sending mark the recipient **uncertain** and pause the queue. There are **no automatic retries** of failed/uncertain recipients. Check the provider dashboard before resuming pending recipients; the app cannot infer whether an uncertain request delivered.
- Results distinguish pending, sending, accepted, failed, uncertain and skipped. The app does not track opens, clicks, delivery events, bounce/complaint events or reply analytics. Monitor those in Resend/Meta and record opt-outs or mark a contact “do not contact” immediately when discovered. WhatsApp STOP and email unsubscribe are handled automatically.
- Bulk campaign ranking and mail merging are deterministic. Existing OpenAI-assisted single-lead draft writing remains separate. SMS and unattended recurring campaign sends are not implemented.

No live messages were sent while implementing or testing this feature. Provider tests use mocks; browser tests run with sending disabled and temporary databases.
