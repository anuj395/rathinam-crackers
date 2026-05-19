# Deploying Rathinam Crackers to AWS EC2

End-to-end runbook. Assumes a single EC2 box with Postgres on RDS (or the same
box). For larger scale, split the API onto its own ASG and put RDS behind a
private subnet.

## 0. What you'll need

- AWS account with permission to launch EC2 + RDS
- Domain (e.g. `rathinamcracker.com`) with DNS you control
- A copy of this repo on the box (`git clone` or `rsync`)

## 1. Launch EC2 (one-time)

- AMI: **Ubuntu 24.04 LTS**, type **t3.small** (2 vCPU / 2 GiB) is enough for a single shop. Move to **t3.medium** if 5+ concurrent cashiers.
- Storage: **40 GB gp3**.
- Security group: open **22** (your IP), **80**, **443** (anywhere).
- Allocate an **Elastic IP** and attach it.

## 2. Provision Postgres

Easiest: **RDS Postgres 16**, `db.t4g.micro`, single-AZ, encrypted, in the same VPC. Note the connection string — you'll set it as `DATABASE_URL`.

If you prefer self-hosted on the same box:

```bash
sudo apt-get install -y postgresql postgresql-contrib
sudo -u postgres createuser ratinam --pwprompt
sudo -u postgres createdb -O ratinam ratinam
# DATABASE_URL=postgres://ratinam:PASSWORD@127.0.0.1:5432/ratinam
```

## 3. Install runtime on the box

```bash
sudo apt-get update && sudo apt-get upgrade -y
# Node 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs build-essential nginx postgresql-client awscli git
sudo npm i -g pnpm@9 pm2
```

## 4. Lay out the code

```bash
sudo mkdir -p /var/www/ratinam /var/log/ratinam /var/backups/ratinam
sudo chown -R "$USER:$USER" /var/www/ratinam /var/log/ratinam /var/backups/ratinam
cd /var/www/ratinam
git clone <YOUR_REPO_URL> .   # or rsync from your workstation
```

## 5. Secrets file

Create `/etc/ratinam.env` (mode 0600, owned by your deploy user). All values from `docs/ENV.md`:

```bash
sudo touch /etc/ratinam.env
sudo chmod 600 /etc/ratinam.env
sudo chown $USER:$USER /etc/ratinam.env
$EDITOR /etc/ratinam.env
```

Minimum required:

```env
DATABASE_URL=postgres://ratinam:PASSWORD@HOST:5432/ratinam
SESSION_SECRET=<run: openssl rand -hex 32>
NODE_ENV=production
PORT=8080
```

Source it before running pm2/cron jobs:

```bash
echo 'set -o allexport; source /etc/ratinam.env; set +o allexport' >> ~/.bashrc
```

## 6. First deploy

```bash
cd /var/www/ratinam
set -o allexport; source /etc/ratinam.env; set +o allexport
chmod +x deploy/scripts/*.sh
./deploy/scripts/deploy-prep.sh
```

The script: installs deps → generates OpenAPI client → builds everything → pushes the schema → installs nginx config → starts pm2 → verifies `/api/healthz`.

## 7. Seed the production database (first time only)

```bash
cd /var/www/ratinam
node --enable-source-maps scripts/dist/seed.js   # or: pnpm --filter @workspace/scripts exec tsx src/seed.ts
```

**Then immediately log in once at `https://rathinamcracker.com` and rotate the seeded admin password from the Users page.**

## 8. TLS certificate

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d rathinamcracker.com -d www.rathinamcracker.com
# certbot installs auto-renew; check it: sudo systemctl status certbot.timer
```

## 9. DNS

Point an `A` record for `rathinamcracker.com` (and `www`) at the EC2 Elastic IP. Wait for propagation, then re-test.

## 10. PM2 on boot

```bash
pm2 startup    # follow the printed command exactly
pm2 save
```

## 11. Cron — backups + idempotency cleanup

```bash
crontab -e
# Add:
0 2 * * * /var/www/ratinam/deploy/scripts/backup.sh                 >> /var/log/ratinam/backup.log 2>&1
0 * * * * /var/www/ratinam/deploy/scripts/idempotency-cleanup.sh    >> /var/log/ratinam/idem.log   2>&1
```

For off-box backups, set `BACKUP_S3_BUCKET=s3://my-bucket/ratinam` in `/etc/ratinam.env` and attach an IAM instance profile with `s3:PutObject` on that bucket.

## 12. Smoke test

From your laptop:

```bash
curl -fsS https://rathinamcracker.com/api/healthz
# -> {"status":"ok"}
```

Then load `https://rathinamcracker.com/` (ERP), `/pos/`, `/warehouse/`, `/website/` and confirm each renders.

## 13. Subsequent deploys

```bash
cd /var/www/ratinam
git pull
./deploy/scripts/deploy-prep.sh
```

## 14. Optional channels (turn on after launch)

These already have the wiring; flipping them on is just adding env values + saving the integration row from the ERP **Settings → Integrations** page:

| Channel | Vars to fill | Where it's used |
|---------|--------------|-----------------|
| WhatsApp (Meta Cloud) | `phoneNumberId`, `accessToken` | Invoice send, order updates |
| WhatsApp (Twilio) | `accountSid`, `authToken`, `fromNumber` | Same |
| SMTP email | `host`, `port`, `username`, `password`, `fromEmail` | Invoices, payment reminders |

The system silently no-ops if any channel is disabled — turning it on later requires no code change.

## 15. Rolling back

```bash
cd /var/www/ratinam
git log --oneline -10
git checkout <previous-good-sha>
./deploy/scripts/deploy-prep.sh
```

Postgres restore from backup:

```bash
gunzip -c /var/backups/ratinam/ratinam_YYYYMMDD_HHMMSS.sql.gz | psql "$DATABASE_URL"
```
