# Quickstart — Fresh AWS EC2 in 30 minutes

> **Audience**: anyone who can launch an EC2 instance and edit DNS records. No Linux / Node / nginx / certbot expertise needed.
>
> The `deploy/install.sh` script does **everything** else: installs Node, PostgreSQL, nginx, certbot, builds all 5 apps, configures the 5-subdomain reverse proxy, requests SSL certs, registers cron + PM2 systemd, and prints the bootstrap admin password.
>
> If you want the long-form, click-by-click reference (with screenshots, IAM policies, RDS, Secrets Manager, ECS Fargate as Path B), open **`DEPLOYMENT_AWS.md`**. This file is the short version.

---

## 0 · What you'll have at the end

Five HTTPS subdomains, all SSL-protected by Let's Encrypt, all backed by one PostgreSQL database:

| URL                                | What it serves                                    |
| ---------------------------------- | ------------------------------------------------- |
| `https://rathinamcracker.com`      | Customer storefront (anonymous + logged-in)       |
| `https://api.rathinamcracker.com`  | Express API (`/api/v1/...`)                       |
| `https://erp.rathinamcracker.com`  | ERP admin panel (login required)                  |
| `https://pos.rathinamcracker.com`  | POS terminal (PIN login)                          |
| `https://wh.rathinamcracker.com`   | Warehouse dashboard                               |

---

## 1 · Buy / point your domain

1. Buy a domain (Route 53, GoDaddy, Namecheap — anything works).
2. In your DNS provider, create **6 A records** all pointing to the EC2 elastic IP you'll allocate in step 3:

   | Host  | Type | Value                       |
   | ----- | ---- | --------------------------- |
   | `@`   | A    | `<EC2 elastic IP>`          |
   | `www` | A    | `<EC2 elastic IP>`          |
   | `api` | A    | `<EC2 elastic IP>`          |
   | `erp` | A    | `<EC2 elastic IP>`          |
   | `pos` | A    | `<EC2 elastic IP>`          |
   | `wh`  | A    | `<EC2 elastic IP>`          |

   TTL `300`. Wait 5–10 minutes after editing for propagation. You can verify with `dig erp.yourdomain.com +short` from your laptop — it should print the EC2 IP.

> ⚠️ Without these DNS records, certbot can't issue SSL certs and the install script will exit with a clear error.

---

## 2 · Launch the EC2 instance

In the AWS console → EC2 → **Launch instance**:

| Field                | Value                                                      |
| -------------------- | ---------------------------------------------------------- |
| Name                 | `ratinam-prod`                                             |
| AMI                  | **Amazon Linux 2023** (free tier eligible)                 |
| Instance type        | `t3.small` (2 vCPU, 2 GB) — bump to `t3.medium` if heavy   |
| Key pair             | Create a new one and download the `.pem`                   |
| VPC                  | Default                                                    |
| Subnet               | Any default public subnet                                  |
| Auto-assign public IP| Enable                                                     |
| Security group       | Create new — see rules below                               |
| Storage              | 30 GB gp3 (SSD)                                            |

**Security group rules** (inbound):

| Type   | Port | Source            | Purpose            |
| ------ | ---- | ----------------- | ------------------ |
| SSH    | 22   | My IP             | You only           |
| HTTP   | 80   | `0.0.0.0/0`       | Certbot + redirect |
| HTTPS  | 443  | `0.0.0.0/0`       | All web traffic    |

After launch:

1. EC2 → **Elastic IPs** → Allocate → Associate with the new instance.
2. Update the 6 DNS A records from step 1 to use this elastic IP.

---

## 3 · SSH in and run the installer

From your laptop:

```bash
chmod 400 ratinam-prod.pem
ssh -i ratinam-prod.pem ec2-user@<elastic-ip>
```

Once you're on the box:

```bash
# Pull the installer (anonymous — works for public repos. For a
# private repo, paste your PAT when the script prompts you.)
curl -fsSL https://raw.githubusercontent.com/abhijeetpandeywork/crackers/main/deploy/install.sh -o /tmp/install.sh

# Run it. The script will ask 3 questions:
#   1. Domain  (default rathinamcracker.com — change to yours)
#   2. Email   (for Let's Encrypt notifications)
#   3. GitHub PAT (blank if the repo is public)
sudo bash /tmp/install.sh
```

Or non-interactively in one line:

```bash
sudo APP_DOMAIN=yourdomain.com \
     ACME_EMAIL=admin@yourdomain.com \
     GITHUB_TOKEN=ghp_xxx \
     bash /tmp/install.sh
```

The script takes **~10 minutes** the first time (most of it is `pnpm install` + building 4 Vite apps). It's safe to re-run any time — every step is idempotent, and re-running on every release is the recommended deploy flow.

When it finishes you'll see:

```
============================================================
  Rathinam Crackers is installed.

  Public site:  https://yourdomain.com
  ERP:          https://erp.yourdomain.com
  POS:          https://pos.yourdomain.com
  Warehouse:    https://wh.yourdomain.com
  API:          https://api.yourdomain.com/api/healthz

  Bootstrap admin password: <random-hex>
    (also stored in /etc/ratinam.env; rotate after first login.)

  Logs:    pm2 logs ratinam-api   |   /var/log/ratinam/
  Reload:  sudo bash /var/www/ratinam/deploy/install.sh   (idempotent)
============================================================
```

**Save the bootstrap password.** Log into the ERP at `https://erp.yourdomain.com` with username `admin` + that password, then change it from the user menu.

---

## 4 · What the installer set up for you

| Component         | Where                                              |
| ----------------- | -------------------------------------------------- |
| App code          | `/var/www/ratinam` (cloned from your GitHub repo)  |
| Secrets           | `/etc/ratinam.env` (chmod 0600, root-owned)        |
| Uploaded media    | `/opt/rathinam/uploads`                            |
| PostgreSQL        | Local cluster on `127.0.0.1:5432`, db `ratinam`    |
| API process       | PM2 single-instance (`pm2 list`)                   |
| nginx config      | `/etc/nginx/conf.d/ratinam.conf` (5 server blocks) |
| SSL certs         | `/etc/letsencrypt/live/<domain>/`                  |
| Nightly backup    | `/etc/cron.d/ratinam` → `/var/backups/ratinam/`    |
| Logs              | `/var/log/ratinam/` and `pm2 logs ratinam-api`     |
| Auto-start on boot| `pm2 startup` + nginx + postgresql systemd units   |

---

## 5 · Day-to-day operations

**Deploy a new version** (from your laptop after `git push`):

```bash
ssh ec2-user@<elastic-ip> "sudo bash /var/www/ratinam/deploy/install.sh"
```

That single command pulls latest, rebuilds, runs migrations, reloads PM2 and nginx. Zero downtime for the static frontends; ~3 sec API restart.

**Check health:**

```bash
curl https://api.yourdomain.com/api/healthz   # → {"ok":true}
pm2 list                                      # → ratinam-api online
sudo systemctl status nginx postgresql        # → active (running)
```

**Tail logs:**

```bash
pm2 logs ratinam-api                  # API
sudo tail -f /var/log/nginx/access.log /var/log/nginx/error.log
```

**Rotate the admin password:** log into the ERP and use the user menu. Or via API:

```bash
curl -X POST https://api.yourdomain.com/api/v1/auth/login \
  -H 'content-type: application/json' \
  -d '{"username":"admin","password":"<old>"}'
```

**Reset the demo data** (for a fresh shop floor in a sandbox env):

```bash
curl -X POST https://api.yourdomain.com/api/v1/admin/demo-reset \
  -H "Authorization: Bearer <admin-token>"
```

---

## 6 · Optional — use AWS RDS instead of local PostgreSQL

For higher availability, point the app at an external RDS instance:

1. Create an RDS PostgreSQL 14+ instance in the same VPC.
2. Allow the EC2 security group on port 5432.
3. Edit `/etc/ratinam.env`:
   ```
   DATABASE_URL=postgresql://user:pass@<rds-endpoint>:5432/ratinam
   ```
4. Re-run `sudo bash /var/www/ratinam/deploy/install.sh`. The script detects the external `DATABASE_URL` and skips local-Postgres bootstrap.

---

## 7 · If something goes wrong

| Symptom                                  | Fix                                                                                                  |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| certbot fails with "DNS problem"         | Wait 10 min after editing DNS, then re-run `sudo bash /var/www/ratinam/deploy/install.sh`            |
| "502 Bad Gateway" on any subdomain       | API isn't running. `pm2 logs ratinam-api` to see why; usually a `/etc/ratinam.env` typo              |
| nginx test fails after re-run            | `sudo nginx -t` for the exact error; check `/etc/nginx/conf.d/ratinam.conf`                          |
| Forgot the bootstrap admin password      | `sudo grep ADMIN_BOOTSTRAP_PASSWORD /etc/ratinam.env`                                                |
| Need to start over from scratch          | `sudo rm -rf /var/www/ratinam /etc/ratinam.env /etc/nginx/conf.d/ratinam.conf` then re-run installer |

For deeper troubleshooting see **`DEPLOYMENT_AWS.md` § 8** (Troubleshooting) and **`PRODUCTION.md`** (the full go-live checklist).

---

## 8 · Files in this repo that drive the deployment

| File                                       | Purpose                                                  |
| ------------------------------------------ | -------------------------------------------------------- |
| `deploy/install.sh`                        | One-command zero-touch installer (interactive)           |
| `deploy/nginx/ratinam-subdomains.conf`     | Production nginx config — 5 server blocks                |
| `deploy/nginx/ratinam.conf`                | (Reference only — old single-domain subfolder layout)    |
| `deploy/pm2/ecosystem.config.cjs`          | PM2 process definition (single instance, fork mode)      |
| `deploy/scripts/backup.sh`                 | Nightly `pg_dump` to `/var/backups/ratinam/`             |
| `deploy/scripts/idempotency-cleanup.sh`    | Hourly cleanup of stale idempotency keys                 |
| `QUICKSTART_AWS.md`                        | This file                                                |
| `DEPLOYMENT_AWS.md`                        | Long-form click-by-click guide (Path A + Path B)         |
| `PRODUCTION.md`                            | Pre-launch checklist & post-launch operations            |
| `README.md`                                | Project overview & developer quickstart                  |
