# Environment variables

All values live in `/etc/ratinam.env` on the production box (mode 0600).
Source it before running pm2/cron/manual scripts.

## Required (server will not start without these)

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | Postgres connection string. Use SSL in prod. | `postgres://ratinam:****@db.xyz.rds.amazonaws.com:5432/ratinam?sslmode=require` |
| `SESSION_SECRET` | Random string used to sign JWTs/sessions. Rotate annually. | `openssl rand -hex 32` |
| `NODE_ENV` | Must be `production` in prod. | `production` |
| `PORT` | Port the API listens on (nginx proxies to this). | `8080` |

## Optional — observability

| Variable | Description | Default |
|----------|-------------|---------|
| `LOG_LEVEL` | pino log level: `trace` `debug` `info` `warn` `error` `fatal`. | `info` |

## Optional — backups

| Variable | Description | Default |
|----------|-------------|---------|
| `BACKUP_DIR` | Where `backup.sh` writes nightly dumps. | `/var/backups/ratinam` |
| `BACKUP_S3_BUCKET` | If set (e.g. `s3://bucket/prefix`), backups are uploaded after dumping. Requires `aws` CLI + IAM. | unset |
| `BACKUP_RETENTION_DAYS` | Local dumps older than this are pruned. | `14` |

## Optional — third-party channels (managed via ERP Settings UI, not env)

These live in the `settings` table because they're per-tenant configuration, not deploy-time secrets. The deploy doesn't need to know them. Once filled from the ERP **Settings → Integrations** page, the relevant adapter starts sending:

- **SMTP / Email** — `host`, `port`, `secure`, `username`, `password`, `fromName`, `fromEmail`
- **WhatsApp (Meta Cloud)** — `phoneNumberId`, `accessToken`, optional `defaultTemplate`
- **WhatsApp (Twilio)** — `accountSid`, `authToken`, `fromNumber`

Until enabled, the notifier logs the would-be message and returns `{ok:false, code:"DISABLED"}` — invoicing/POS continue to work normally.
