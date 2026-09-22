# Publish Dhampur Green Grow

The application needs **one always-on Node/Docker service and a persistent volume**. The frontend, API and scheduler are deployed together. A static frontend deployment alone does not publish this application. No provider service has been created by preparing these files.

## Railway (integrated deployment option)

1. Install and connect the Railway integration in this conversation, or use an existing Railway project through your account.
2. Create one service from this source. `railway.json` configures the Docker build, health check, one replica and an always-on process. Review the account's hosting and storage charges before provisioning a paid service.
3. Attach a persistent volume at **`/app/storage`**. This is essential. Set `DATABASE_PATH=/app/storage/grow.db` and `BACKUP_DIR=/app/storage/backups` (the app also derives these from `RAILWAY_VOLUME_MOUNT_PATH`).
4. In Railway's environment variables, set `ADMIN_EMAIL` and a unique `ADMIN_PASSWORD` of at least 12 characters. Generate a Railway HTTPS domain. The app derives its public address from `RAILWAY_PUBLIC_DOMAIN`, or set `APP_URL` explicitly.
5. Deploy. Confirm `/api/health` responds, sign in, create a test record and restart the deployment to check persistence. Settings shows capability configuration status.
6. Optionally add `grow.dhampurgreen.com` as a custom domain. Apply the DNS record Railway supplies, then set `APP_URL=https://grow.dhampurgreen.com` and redeploy. Do not change the main website's DNS records.

The application process runs as `node` inside the container. The entrypoint initializes ownership only on `/app/storage` so a newly attached volume is writable before dropping privileges. Keep the volume at that exact path for this Docker configuration.

Official references: [Railway volumes](https://docs.railway.com/volumes), [public networking](https://docs.railway.com/networking/public-networking), [deployment configuration](https://docs.railway.com/config-as-code/reference).

## Render alternative

Create a Blueprint from a private Git repository using the included `render.yaml`. It configures a single Node service in Singapore with a 1 GB persistent disk, a generated administrator password and daily backups. Set your administrator email during setup. The service uses Render's assigned HTTPS address through `RENDER_EXTERNAL_URL`; `APP_URL` can override it for a custom domain.

The Blueprint selects a **paid** compute service and disk. Review the costs in your account before creating it. No service or subscription has been created here. The generated password is available in your service's environment settings; never commit it.

Official references: [Render Blueprint specification](https://render.com/docs/blueprint-spec), [persistent disks](https://render.com/docs/disks).

## Enable capabilities when ready

| Capability | Server secret/configuration |
| --- | --- |
| Find new businesses automatically | `GOOGLE_PLACES_API_KEY` with Places API (New) and billing enabled |
| Personalize drafts with AI | `OPENAI_API_KEY` and optional `OPENAI_MODEL` |
| Find missing business emails | `HUNTER_API_KEY` |
| Send reviewed emails | `RESEND_API_KEY`, a verified `OUTREACH_FROM`, `OUTREACH_REPLY_TO`, `OUTREACH_ENABLED=true` |

Provider keys are optional for publishing: the researched prospects, CRM, call history, follow-ups and catalogue templates work without them. Configure keys in your hosting dashboard, never in frontend code or chat. Restart after changing them. A configured key still needs a real provider request to validate access and billing.

## Verify before publishing

```bash
npm run build
npm test
npm run test:e2e
npm run verify:production
```

`verify:production` uses an isolated temporary database and generated test credentials on port 3006. It checks the compiled frontend, protected API, secure cookies, real data seeding and persistence after restart. It never uses your provider keys or sends messages.

## Backups and migration

With `BACKUP_DIR` configured, the server writes a SQLite snapshot on startup when needed, then checks hourly for the next daily snapshot. It retains seven completed snapshots by default (`BACKUP_RETENTION`). Snapshots are owner-readable only. Backup failures appear in Settings. Run `npm run backup` for an on-demand snapshot.

Backups on the same volume do not protect against losing that volume. Keep an encrypted off-host copy or enable your hosting provider's volume backup service. To preserve existing local CRM edits, take a snapshot, transfer it privately to the persistent volume as `grow.db` while the hosted service is stopped, then start the service. Never put database files in the source archive or Git. Without that migration, a first deployment starts with the researched businesses and a fresh CRM.
