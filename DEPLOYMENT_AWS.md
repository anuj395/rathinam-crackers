# AWS Deployment Guide — Rathinam Crackers Platform

> **Audience**: Someone who has an AWS account but has never deployed a Node app on AWS before. Every step is click-by-click. If you already know AWS, skim the headings — the structure mirrors a real production checklist.
>
> **Time budget**: ~3–4 hours from zero to live HTTPS URL on Path A. ~1 day on Path B (CI/CD + container infra).
>
> **Cost (Mumbai region, INR, May 2026 prices)**:
> - Path A: ₹3 000 – ₹6 000 / month (single EC2 + db.t4g.small RDS)
> - Path B: ₹10 000 – ₹20 000 / month (Fargate + Multi-AZ RDS + ALB + CloudFront)

---

## Table of contents

0. [Before you start — prerequisites & decisions](#0-before-you-start)
1. [One-time AWS account hardening](#1-one-time-aws-account-hardening)
2. [Route 53 + domain](#2-route-53--domain)
3. [Path A — single EC2 + RDS (recommended for go-live)](#3-path-a--single-ec2--rds)
   - 3.1 VPC & security groups
   - 3.2 RDS PostgreSQL (click-by-click)
   - 3.3 Secrets Manager
   - 3.4 EC2 instance (click-by-click)
   - 3.5 Bootstrap the server
   - 3.6 Pull secrets, migrate, seed
   - 3.7 Build the apps
   - 3.8 Run with PM2 (or systemd)
   - 3.9 nginx reverse proxy
   - 3.10 HTTPS with certbot
   - 3.11 DNS cutover
   - 3.12 Smoke test
   - 3.13 Backups
   - 3.14 Monitoring + alarms
   - 3.15 Rollback procedure
4. [Path B — ECS Fargate + RDS + ALB + CloudFront](#4-path-b--ecs-fargate)
   - 4.1 Build images & push to ECR
   - 4.2 RDS (Multi-AZ)
   - 4.3 ALB + target groups
   - 4.4 ECS cluster + services
   - 4.5 CloudFront distribution
   - 4.6 GitHub Actions CI/CD
5. [Day-2 operations](#5-day-2-operations)
   - Updating the app
   - Rotating secrets
   - Scaling vertically
   - Adding a read replica
   - Disaster recovery drill
6. [Security hardening checklist](#6-security-hardening-checklist)
7. [Cost optimization](#7-cost-optimization)
8. [Troubleshooting](#8-troubleshooting)
9. [Appendix — useful commands & files](#9-appendix)

---

## 0. Before you start

### Required accounts / tools

| Item                                    | Purpose                                       |
| --------------------------------------- | --------------------------------------------- |
| AWS account with billing enabled        | Hosting                                       |
| Domain name                             | HTTPS + customer-facing URL                   |
| GitHub repo (already pushed)            | Source of truth & CI                          |
| Local: AWS CLI v2 + git + ssh           | Bootstrap & ongoing ops                       |
| Local: a password manager               | DB master password, JWT secret, PAT           |

```bash
# verify locally
aws --version          # aws-cli/2.x
git --version
ssh -V
```

### Decisions you must make first

1. **Region.** Use `ap-south-1` (Mumbai) — lowest latency for India and the most natural fit for GST data residency.
2. **Domain.** Pick the public URL (e.g. `crackers.example.com`). The whole platform sits on this one domain; sub-paths route to the right app.
3. **Path A or B.**
   - Path A if you have ≤ 1 000 orders/day, want low cost, and can tolerate ~1 minute of downtime during a deploy.
   - Path B if you need zero-downtime deploys, multi-AZ DB failover, or expect rapid growth.
4. **Email** for certificate renewal alerts and AWS billing alerts.

### What gets deployed

Five apps + one DB share **one HTTPS host** with **path-based routing**:

| Path           | App                  | Built by                         |
| -------------- | -------------------- | -------------------------------- |
| `/`            | ERP (admin)          | `pnpm --filter @workspace/erp run build` |
| `/pos/`        | POS                  | `pnpm --filter @workspace/pos run build` |
| `/warehouse/`  | Warehouse            | `pnpm --filter @workspace/warehouse run build` |
| `/website/`    | Customer storefront  | `pnpm --filter @workspace/website run build` |
| `/api/`        | Express API          | `pnpm --filter @workspace/api-server run build` |

All four SPAs build to static files (`dist/`). Only the API needs Node at runtime.

---

## 1. One-time AWS account hardening

Skip if already done. **Do this even for a hobby account.**

1. **Enable MFA on the root user**
   IAM → *Users* → click your root account → *Security credentials* → *Assign MFA device*.
2. **Stop using the root user.** Create an IAM user `rathinam-admin`:
   IAM → *Users* → *Create user* → name `rathinam-admin` → *Next* → attach `AdministratorAccess` (we'll downscope later) → *Next* → *Create*.
3. **Generate access keys** for `rathinam-admin` (Security credentials → Access keys → Create) and store them in a password manager. Never commit to git.
4. **Configure AWS CLI** locally:
   ```bash
   aws configure
   # AWS Access Key ID: AKIA…
   # AWS Secret Access Key: …
   # Default region: ap-south-1
   # Default output format: json
   ```
5. **Set a billing alarm** at ₹3 000 and ₹10 000:
   Billing → *Budgets* → *Create budget* → *Cost budget* → monthly fixed → *Add alert at 80%* → email yourself.
6. **Enable cost allocation tags**: Billing → *Cost allocation tags* → activate `Project` and `Environment`. We'll tag every resource with `Project=rathinam Environment=prod`.

---

## 2. Route 53 + domain

If your domain is **not** at Route 53, just create a Hosted Zone, copy the four NS records into your registrar — that's enough.

1. Route 53 → *Hosted zones* → *Create hosted zone* → enter `example.com` → *Create*.
2. Note the four `NS` values. At your registrar (GoDaddy, Namecheap, etc.), replace the existing nameservers with these four. DNS propagation: 5 min – 24 h.
3. We'll add the actual `A` record after the EC2 / ALB exists.

---

## 3. Path A — single EC2 + RDS

Topology:

```
  Internet → Route 53 (A record)
         → EC2 (Elastic IP, nginx :443)
         ├── /api/  → Node API on :8080
         └── /, /pos/, /warehouse/, /website/  → static dist served by nginx
                                                          ↓
                                                       RDS PostgreSQL
                                                       (private subnet)
```

### 3.1 VPC & security groups

The default VPC is fine. Create two security groups so RDS is only reachable from EC2.

1. **EC2 SG** (`rathinam-ec2-sg`):
   - Inbound: TCP 22 from *your home IP* (`x.x.x.x/32`)
   - Inbound: TCP 80 from `0.0.0.0/0`
   - Inbound: TCP 443 from `0.0.0.0/0`
   - Outbound: all
2. **RDS SG** (`rathinam-rds-sg`):
   - Inbound: TCP 5432 from *Source = `rathinam-ec2-sg`* (security-group reference, not a CIDR)
   - Outbound: all

VPC console → Security Groups → *Create security group* → fill the above twice.

### 3.2 RDS PostgreSQL

1. RDS console → *Create database* → **Standard create**.
2. Engine: **PostgreSQL**, version **16.x** (latest minor).
3. Templates: **Production** (or **Dev/Test** to save cost; you can switch later).
4. Settings:
   - DB instance identifier: `rathinam-prod`
   - Master username: `rathinam`
   - **Auto-generate password** ✅ (you'll see it once — save it immediately to your password manager)
5. Instance config: **Burstable classes (db.t4g…) → db.t4g.small** (2 vCPU, 2 GB RAM). Plenty for 1 000+ orders/day.
6. Storage: **gp3, 50 GB**, autoscaling enabled, max 200 GB.
7. Connectivity:
   - VPC: default
   - Public access: **No**
   - VPC security group: **Choose existing** → `rathinam-rds-sg`
   - Availability Zone: any one (pick the same AZ where EC2 will live — saves transfer cost)
8. Database authentication: Password authentication.
9. Additional config:
   - Initial database name: `rathinam`
   - Backup retention: **7 days**, window 02:00–02:30 UTC
   - Encryption: ✅ default KMS key
   - Performance Insights: ✅ free 7-day retention
   - Maintenance window: pick a low-traffic time
   - Deletion protection: ✅
10. *Create database*. Provisioning takes 5–10 minutes.
11. When status = Available, copy the **Endpoint** (looks like `rathinam-prod.xxxxx.ap-south-1.rds.amazonaws.com`).

### 3.3 Secrets Manager

Store all production secrets in one JSON secret so the EC2 can pull them at boot.

1. Secrets Manager console → *Store a new secret* → **Other type of secret**.
2. Plaintext JSON:
   ```json
   {
     "DATABASE_URL": "postgresql://rathinam:THE_PASSWORD@rathinam-prod.xxxxx.ap-south-1.rds.amazonaws.com:5432/rathinam",
     "SESSION_SECRET": "<openssl rand -hex 32>",
     "JWT_SECRET":     "<openssl rand -hex 32>",
     "NODE_ENV":       "production",
     "PORT":           "8080"
   }
   ```
   Generate the random secrets locally with `openssl rand -hex 32` and paste them in.
3. Encryption key: default.
4. Secret name: `rathinam/app`. Tag `Project=rathinam Environment=prod`.
5. Disable automatic rotation for now.
6. *Store*.

### 3.4 EC2 instance

1. EC2 console → *Launch instance*.
2. Name: `rathinam-prod`.
3. AMI: **Amazon Linux 2023** (ARM, `t4g`). Cheaper and faster than x86.
4. Instance type: **t4g.small** (2 vCPU, 2 GB). Bump to `t4g.medium` if memory-tight.
5. Key pair: *Create new* → ED25519 → download the `.pem`. Move it to `~/.ssh/rathinam.pem` and `chmod 600` it.
6. Network: default VPC, default subnet (any AZ — pick the same as RDS).
7. Firewall (security group): **Select existing** → `rathinam-ec2-sg`.
8. Storage: **30 GB gp3**.
9. Advanced details:
   - **IAM instance profile** → *Create new role*: trust = EC2, attach policies:
     - `AmazonSSMManagedInstanceCore` (so you can shell in via Session Manager — no SSH key needed)
     - **Inline policy** to read the secret:
       ```json
       {
         "Version": "2012-10-17",
         "Statement": [{
           "Effect": "Allow",
           "Action": ["secretsmanager:GetSecretValue"],
           "Resource": "arn:aws:secretsmanager:ap-south-1:ACCOUNT_ID:secret:rathinam/app-*"
         }]
       }
       ```
     - Name the role `rathinam-ec2-role`. Re-select it in the launch wizard.
10. *Launch instance*.
11. Allocate an **Elastic IP** and attach it to the new instance:
    EC2 → *Elastic IPs* → *Allocate* → *Associate* → choose `rathinam-prod`. Note the IP.

### 3.5 Bootstrap the server

SSH in (or use Session Manager from the EC2 console — no SSH needed).

```bash
ssh -i ~/.ssh/rathinam.pem ec2-user@<elastic-ip>
```

Install runtime + tools:

```bash
sudo dnf update -y
sudo dnf install -y git nginx jq

# Node 20 (NodeSource for ARM64)
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo dnf install -y nodejs

# pnpm + PM2
sudo npm i -g pnpm@9 pm2

# verify
node -v   # v20.x
pnpm -v   # 9.x
pm2 -v
```

Clone the repo:

```bash
sudo mkdir -p /opt/rathinam && sudo chown ec2-user:ec2-user /opt/rathinam
cd /opt/rathinam

# Use a deploy key (read-only) for private repos. Generate on the EC2:
ssh-keygen -t ed25519 -N '' -f ~/.ssh/github_deploy
cat ~/.ssh/github_deploy.pub
# Copy the printed key. On GitHub: repo → Settings → Deploy keys → Add → paste → Allow read.

# Configure git to use it
cat >> ~/.ssh/config <<'EOF'
Host github.com
  HostName github.com
  User git
  IdentityFile ~/.ssh/github_deploy
  IdentitiesOnly yes
EOF
chmod 600 ~/.ssh/config

git clone git@github.com:abhijeetpandeywork/crackers.git .
```

Install dependencies:

```bash
pnpm install --frozen-lockfile
```

### 3.6 Pull secrets, migrate, seed

Helper script that fetches the secret and writes `.env`:

```bash
sudo tee /usr/local/bin/pull-secrets.sh > /dev/null <<'EOF'
#!/bin/bash
set -euo pipefail
aws secretsmanager get-secret-value \
  --region ap-south-1 \
  --secret-id rathinam/app \
  --query SecretString --output text \
  | jq -r 'to_entries | .[] | "\(.key)=\(.value)"' \
  > /opt/rathinam/.env
chown ec2-user:ec2-user /opt/rathinam/.env
chmod 600 /opt/rathinam/.env
EOF
sudo chmod +x /usr/local/bin/pull-secrets.sh
sudo /usr/local/bin/pull-secrets.sh

# verify (do NOT cat — secrets inside)
ls -l /opt/rathinam/.env
```

Run migrations + seed (loads `.env`):

```bash
cd /opt/rathinam
set -a && . ./.env && set +a

pnpm --filter @workspace/db run migrate
pnpm --filter @workspace/scripts run seed       # creates default admin/cashier/etc
```

You should see "Seeded N rows" with no errors.

### 3.7 Build the apps

```bash
cd /opt/rathinam
pnpm --filter @workspace/api-spec run codegen
pnpm -r run build
```

Each frontend now has a `dist/` directory; the API has `artifacts/api-server/dist/index.js`.

### 3.8 Run with PM2 (just the API)

We let nginx serve all the static SPAs directly — only the API needs a Node process.

Create `/opt/rathinam/ecosystem.config.cjs`:

```js
module.exports = {
  apps: [{
    name: "api",
    cwd: "/opt/rathinam/artifacts/api-server",
    script: "node",
    args: "dist/index.js",
    instances: 1,                  // bump to "max" once you have ≥ 2 vCPU dedicated
    exec_mode: "fork",
    max_memory_restart: "800M",
    env: {
      NODE_ENV: "production",
      PORT: "8080",
    },
    env_file: "/opt/rathinam/.env",
    error_file: "/var/log/rathinam-api.err.log",
    out_file:   "/var/log/rathinam-api.out.log",
    time: true,
  }],
};
```

Start & persist:

```bash
sudo touch /var/log/rathinam-api.err.log /var/log/rathinam-api.out.log
sudo chown ec2-user /var/log/rathinam-api.*

cd /opt/rathinam
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup systemd -u ec2-user --hp /home/ec2-user
# pm2 prints a `sudo env …` command — copy & run it. This makes PM2 survive reboots.

# health check
curl -s http://localhost:8080/api/healthz
# {"ok":true}
```

### 3.9 nginx reverse proxy

`/etc/nginx/conf.d/rathinam.conf` (initially HTTP only — TLS comes next):

```nginx
upstream api_upstream { server 127.0.0.1:8080; keepalive 32; }

server {
  listen 80 default_server;
  server_name _;

  client_max_body_size 25m;
  gzip on;
  gzip_types text/plain text/css application/json application/javascript text/xml application/xml image/svg+xml;
  gzip_min_length 1024;

  # API
  location /api/ {
    proxy_http_version 1.1;
    proxy_set_header Host              $host;
    proxy_set_header X-Real-IP         $remote_addr;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Connection        "";
    proxy_pass http://api_upstream;
  }

  # POS
  location /pos/ {
    alias /opt/rathinam/artifacts/pos/dist/;
    try_files $uri /pos/index.html;
  }

  # Warehouse
  location /warehouse/ {
    alias /opt/rathinam/artifacts/warehouse/dist/;
    try_files $uri /warehouse/index.html;
  }

  # Website (customer storefront)
  location /website/ {
    alias /opt/rathinam/artifacts/website/dist/;
    try_files $uri /website/index.html;
  }

  # ERP at root (catch-all, must be last)
  location / {
    root /opt/rathinam/artifacts/erp/dist/;
    try_files $uri /index.html;
  }

  # cache hashed assets aggressively
  location ~* \.(js|css|woff2?|svg|png|jpg|jpeg|webp|gif|ico)$ {
    expires 1y;
    add_header Cache-Control "public, immutable";
    access_log off;
    try_files $uri =404;
  }
}
```

Activate:

```bash
sudo nginx -t                 # syntax check
sudo systemctl enable nginx
sudo systemctl restart nginx
curl -sI http://<elastic-ip>/ | head -5   # 200 OK with HTML
```

### 3.10 HTTPS with certbot

```bash
sudo dnf install -y certbot python3-certbot-nginx
sudo certbot --nginx \
  -d crackers.example.com \
  --redirect \
  -m you@example.com \
  --agree-tos \
  --no-eff-email
```

certbot rewrites `rathinam.conf` to add the 443 server, redirect 80 → 443, and installs a renewal timer (`systemctl status certbot.timer`).

Verify:
```bash
sudo certbot renew --dry-run
curl -sI https://crackers.example.com/ | head -5
```

### 3.11 DNS cutover

Route 53 → Hosted zones → `example.com` → *Create record*:
- Name: `crackers`
- Type: `A`
- Value: `<elastic-ip>`
- TTL: 300

Wait 1–5 minutes. `dig crackers.example.com +short` should return your Elastic IP.

### 3.12 Smoke test (matches `PRODUCTION.md` § 3)

Hit each surface:

```bash
BASE=https://crackers.example.com

curl -s $BASE/api/healthz                                # {"ok":true}
curl -sI $BASE/                | grep -i ^content-type   # text/html
curl -sI $BASE/pos/            | grep -i ^content-type
curl -sI $BASE/warehouse/      | grep -i ^content-type
curl -sI $BASE/website/        | grep -i ^content-type

# Login
TOKEN=$(curl -s $BASE/api/v1/auth/login \
  -H 'content-type: application/json' \
  -d '{"username":"admin","password":"Admin@12345"}' | jq -r .accessToken)
curl -s $BASE/api/v1/me -H "authorization: Bearer $TOKEN" | jq .
```

Then in a real browser:
1. Open `https://crackers.example.com/` → log in as `admin/Admin@12345` → **change the password immediately** (Settings → Profile).
2. Open `https://crackers.example.com/verifier` → click *Run all checks* → every section must be green.
3. Open `/help` → spot-check 2–3 topics render.
4. POS at `/pos/` → log in as `cashier`/PIN 3456 → load 1 product → ring up a tiny test sale → void.
5. Website at `/website/` → log in as a test customer → place an order → cancel from "My orders" → confirm stock restored in the ERP.

If any of these fail, see [Troubleshooting](#8-troubleshooting).

### 3.13 Backups

RDS already does daily snapshots (7-day retention). Add a **second** off-AWS dump for safety.

1. Create an S3 bucket: `rathinam-backups-<account-id>` (block all public access).
2. Lifecycle: transition to *Glacier Instant Retrieval* after 30 days, expire after 365 days.
3. Add `s3:PutObject` on the bucket to `rathinam-ec2-role`.
4. On the EC2:
   ```bash
   sudo tee /usr/local/bin/db-backup.sh > /dev/null <<'EOF'
   #!/bin/bash
   set -euo pipefail
   set -a; . /opt/rathinam/.env; set +a
   F=/tmp/rathinam-$(date +%F-%H%M).sql.gz
   pg_dump "$DATABASE_URL" | gzip > "$F"
   aws s3 cp "$F" s3://rathinam-backups-ACCOUNT_ID/db/ --region ap-south-1
   rm -f "$F"
   EOF
   sudo chmod +x /usr/local/bin/db-backup.sh
   sudo dnf install -y postgresql16            # for pg_dump

   # cron @ 03:30 IST = 22:00 UTC (off-peak)
   ( crontab -l 2>/dev/null; echo "0 22 * * * /usr/local/bin/db-backup.sh >> /var/log/db-backup.log 2>&1" ) | crontab -
   ```
5. Code is already on GitHub — that's your code backup.

### 3.14 Monitoring + alarms

Bare minimum:

1. **CloudWatch agent** for system metrics + logs:
   ```bash
   sudo dnf install -y amazon-cloudwatch-agent
   sudo /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-config-wizard
   # accept defaults; collect /var/log/rathinam-api.*.log and /var/log/nginx/*.log
   sudo systemctl enable --now amazon-cloudwatch-agent
   ```
2. **CloudWatch alarms** (Console → CloudWatch → Alarms → Create):
   - EC2 `CPUUtilization` > 80% for 10 min → SNS email
   - EC2 `StatusCheckFailed` ≥ 1 → SNS email
   - RDS `CPUUtilization` > 80% for 10 min
   - RDS `FreeStorageSpace` < 5 GB
   - Route 53 health check on `https://crackers.example.com/api/healthz` (return 200) — fires within 60 seconds of an outage
3. **Application observability**: `/api/healthz` is already wired. Bookmark `/verifier` and run it daily. For deeper insight, drop in Sentry (`@sentry/node` in the API, `@sentry/react` in each SPA) — 5 minutes of work, free tier covers a small business.

### 3.15 Rollback procedure

Tag every release **before** deploying:

```bash
git tag -a v$(date +%Y.%m.%d) -m "Release $(date +%Y-%m-%d)"
git push --tags
```

To roll back code:

```bash
cd /opt/rathinam
git fetch --tags
git checkout v2026.05.03         # the previous good tag
pnpm install --frozen-lockfile
pnpm --filter @workspace/api-spec run codegen
pnpm -r run build
pm2 reload all
```

To roll back the **database**, restore the latest RDS snapshot to a *new* instance, then update the `DATABASE_URL` in Secrets Manager and re-run `pull-secrets.sh && pm2 reload all`. Never restore in-place over a live DB.

---

## 4. Path B — ECS Fargate

For zero-downtime, multi-AZ, autoscaling deployments. The application code is identical; only the infra changes.

### 4.1 Build images & push to ECR

A starter `Dockerfile` for the API server (place at repo root):

```dockerfile
FROM node:20-alpine AS deps
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9 --activate
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY artifacts/api-server/package.json artifacts/api-server/
COPY lib/ lib/
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
RUN pnpm --filter @workspace/api-spec run codegen \
 && pnpm --filter @workspace/api-server run build

FROM node:20-alpine AS run
WORKDIR /app
COPY --from=build /app /app
ENV NODE_ENV=production PORT=8080
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://localhost:8080/api/healthz || exit 1
CMD ["node", "artifacts/api-server/dist/index.js"]
```

Build & push:

```bash
ACCT=$(aws sts get-caller-identity --query Account --output text)
aws ecr create-repository --repository-name rathinam-api --region ap-south-1
aws ecr get-login-password --region ap-south-1 | docker login --username AWS --password-stdin $ACCT.dkr.ecr.ap-south-1.amazonaws.com

docker buildx build --platform linux/arm64 -t rathinam-api:v1 .
docker tag rathinam-api:v1 $ACCT.dkr.ecr.ap-south-1.amazonaws.com/rathinam-api:v1
docker push $ACCT.dkr.ecr.ap-south-1.amazonaws.com/rathinam-api:v1
```

For the SPAs, build static once and host them on **S3 + CloudFront** (much cheaper than running them in containers):

```bash
pnpm -r run build
aws s3 sync artifacts/erp/dist/        s3://rathinam-static-prod/erp/        --delete
aws s3 sync artifacts/pos/dist/        s3://rathinam-static-prod/pos/        --delete
aws s3 sync artifacts/warehouse/dist/  s3://rathinam-static-prod/warehouse/  --delete
aws s3 sync artifacts/website/dist/    s3://rathinam-static-prod/website/    --delete
```

CloudFront origins:
- Default behavior + `/api/*` → ALB (origin protocol HTTPS)
- `/`        → S3 erp/
- `/pos/*`         → S3 pos/
- `/warehouse/*`   → S3 warehouse/
- `/website/*`     → S3 website/

### 4.2 RDS (Multi-AZ)

Same as 3.2 but **Multi-AZ deployment = Yes** and instance class `db.t4g.medium`. Enable `Performance Insights` and `Enhanced Monitoring` (60 s).

### 4.3 ALB + target groups

EC2 → Load Balancers → *Create Application Load Balancer*:
- Internet-facing, IPv4, two AZs
- Listeners: 80 (redirect → 443), 443 (forward → target group `rathinam-api-tg`)
- ACM certificate for `crackers.example.com` (request via ACM, DNS-validated against Route 53)
- Target group `rathinam-api-tg`: target type **IP**, protocol HTTP, port 8080, health check `/api/healthz`

### 4.4 ECS cluster + services

1. ECS console → *Clusters* → *Create* → name `rathinam`, networking-only (Fargate).
2. *Task definition* → name `rathinam-api`:
   - Launch type: Fargate, ARM64
   - Task role: `rathinam-task-role` (allow `secretsmanager:GetSecretValue` on `rathinam/app`)
   - Execution role: `ecsTaskExecutionRole` (default)
   - Container: image `…/rathinam-api:v1`, port 8080, cpu 512, memory 1024
   - Secrets: each env var pulled from Secrets Manager ARN (`rathinam/app:DATABASE_URL::`, etc.)
   - Health check: `CMD-SHELL wget -qO- http://localhost:8080/api/healthz || exit 1`
3. *Service* → cluster `rathinam` → task def `rathinam-api` → desired count 2 → ALB `rathinam-api-tg` → enable autoscaling (target tracking on `ALBRequestCountPerTarget=100`).

### 4.5 CloudFront distribution

CloudFront → *Create distribution*:
- Origins: ALB (HTTPS) + the S3 bucket per SPA
- Behaviors as listed in 4.1
- Alternate domain name: `crackers.example.com`, ACM cert from us-east-1 (CloudFront requires certs in us-east-1)
- Route 53 → A (alias) → CloudFront distribution

### 4.6 GitHub Actions CI/CD

`.github/workflows/deploy.yml`:

```yaml
name: deploy
on:
  push:
    branches: [main]
permissions:
  id-token: write
  contents: read
jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @workspace/api-spec run codegen
      - run: pnpm run typecheck
      - run: pnpm -r run build
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::ACCOUNT_ID:role/github-deployer
          aws-region: ap-south-1
      # SPAs → S3
      - run: aws s3 sync artifacts/erp/dist        s3://rathinam-static-prod/erp        --delete
      - run: aws s3 sync artifacts/pos/dist        s3://rathinam-static-prod/pos        --delete
      - run: aws s3 sync artifacts/warehouse/dist  s3://rathinam-static-prod/warehouse  --delete
      - run: aws s3 sync artifacts/website/dist    s3://rathinam-static-prod/website    --delete
      - run: aws cloudfront create-invalidation --distribution-id ${{ secrets.CF_DIST_ID }} --paths "/*"
      # API → ECR + ECS
      - run: |
          IMG=$(aws sts get-caller-identity --query Account --output text).dkr.ecr.ap-south-1.amazonaws.com/rathinam-api:${{ github.sha }}
          aws ecr get-login-password --region ap-south-1 | docker login --username AWS --password-stdin ${IMG%/*}
          docker buildx build --platform linux/arm64 -t $IMG --push .
          aws ecs update-service --cluster rathinam --service rathinam-api --force-new-deployment
```

Set up an IAM role `github-deployer` with OIDC trust on `repo:abhijeetpandeywork/crackers:*` and the policies it needs (`ecr:*`, `ecs:UpdateService`, `s3:PutObject`/`DeleteObject` on the bucket, `cloudfront:CreateInvalidation`).

---

## 5. Day-2 operations

### Updating the app (Path A)

```bash
ssh ec2-user@<elastic-ip>
cd /opt/rathinam
git fetch --tags
git checkout main && git pull
pnpm install --frozen-lockfile
pnpm --filter @workspace/api-spec run codegen
pnpm -r run build
pm2 reload all                # zero downtime for the API
sudo systemctl reload nginx   # picks up new dist/ symlinks if any
```

If the change includes DB migrations:
```bash
set -a && . ./.env && set +a
pnpm --filter @workspace/db run migrate
```

Always tag the new release:
```bash
git tag -a v$(date +%Y.%m.%d) -m "Release"
git push --tags
```

### Rotating secrets

```bash
# generate new
openssl rand -hex 32
# Secrets Manager → rathinam/app → Edit → update SESSION_SECRET / JWT_SECRET
# On the EC2:
sudo /usr/local/bin/pull-secrets.sh
pm2 reload all     # picks up new env
```

### Scaling vertically

EC2: stop instance → change instance type → start → done. Elastic IP stays.
RDS: Modify → larger instance class → "Apply immediately" or wait for next maintenance window.

### Adding a read replica (when reads dominate)

RDS → *Actions* → *Create read replica*. Point heavy read queries at the replica (introduce a separate `DATABASE_URL_RO` env var and a tiny router in the API for explicitly-read-only endpoints).

### Disaster recovery drill (do this once a quarter)

1. Pick an RDS snapshot from yesterday → *Restore* → new instance `rathinam-dr-test`.
2. Spin up a `t4g.small` EC2 with the same setup, point its `DATABASE_URL` at the restored DB.
3. Run `/verifier` → must be green.
4. Tear down both. Confirm you could be live again in < 1 hour.

---

## 6. Security hardening checklist

- [ ] Root user MFA, root keys deleted
- [ ] IAM users use MFA; no AWS keys in source
- [ ] Default seed passwords changed (`admin`, `manager`, `cashier`, `warehouse`)
- [ ] `SESSION_SECRET` and `JWT_SECRET` are 32-byte random and set explicitly
- [ ] RDS `Public access = No`, SG only allows EC2 SG
- [ ] EC2 SG SSH limited to your IP (or use Session Manager only and remove 22 entirely)
- [ ] `deletion_protection` ON for RDS
- [ ] HTTPS only (HTTP redirects), HSTS header on nginx (`add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;`)
- [ ] `/api/healthz` returns 200; no other unauthenticated endpoint exposes data
- [ ] CloudTrail enabled (free first trail) — Console → CloudTrail → Trails → *Create* → all regions, S3 destination
- [ ] AWS Config rules: `restricted-ssh`, `s3-bucket-public-read-prohibited`, `rds-storage-encrypted`
- [ ] Daily `/verifier` run (manual or via Lambda + EventBridge)
- [ ] Quarterly DR drill (see § 5)

---

## 7. Cost optimization

| Lever                                              | Saving                          |
| -------------------------------------------------- | ------------------------------- |
| Use `t4g` (ARM Graviton) everywhere                | ~20% vs x86                     |
| Buy a 1-year **Compute Savings Plan** for the EC2  | ~30% off on-demand              |
| Buy a 1-year **RDS Reserved Instance**             | ~35% off                        |
| Single-AZ RDS                                      | half the cost vs Multi-AZ       |
| S3 Intelligent-Tiering for backups                 | auto-tier cold data to Glacier  |
| Stop non-prod EC2s outside business hours          | up to 70% off dev environments  |
| Set the Billing budget at ₹3 000 → email alert     | catches surprises before they hurt |

Don't over-provision early. `db.t4g.small` + `t4g.small` comfortably handle 1 000 orders/day. Scale up when monitoring shows sustained > 70% CPU or > 80% RAM.

---

## 8. Troubleshooting

| Symptom                                          | Likely cause                                       | Fix                                                                                          |
| ------------------------------------------------ | -------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `502 Bad Gateway` from nginx                     | API process crashed or wrong port                  | `pm2 logs api`, fix, `pm2 restart api`                                                       |
| `ECONNREFUSED 127.0.0.1:5432` from API           | Wrong `DATABASE_URL` or RDS SG blocks EC2          | Re-pull secrets; confirm RDS SG inbound is the EC2 SG                                        |
| API logs `relation "x" does not exist`           | Migrations not run on this DB                      | `set -a && . .env && set +a; pnpm --filter @workspace/db run migrate`                        |
| White page at `/pos/`                            | nginx `alias` missing trailing slash, or wrong base path in Vite build | Check nginx `alias /opt/rathinam/artifacts/pos/dist/;` (trailing slash); rebuild with correct `--base /pos/` |
| HTTPS cert won't issue                           | DNS not propagated yet                             | `dig crackers.example.com +short` must return your EIP first                                 |
| `429 Too Many Requests` from certbot             | Hit Let's Encrypt rate limit                       | Wait 1 hour; use `--staging` flag while testing                                              |
| Verifier shows red on `/api/v1/auth/login`       | Default password rotated, verifier looking for old | Open `/verifier`, click *Override credentials*, paste current password                       |
| Slow queries on dashboard                        | Missing index                                      | RDS Performance Insights → top SQL → add index in `lib/db/src/schema/`, generate migration   |
| Out of memory (OOM) on EC2                       | Too small instance for the build step              | `pnpm -r run build` peaks ~1.2 GB; either move build to CI (Path B) or upsize to `t4g.medium` |
| `pm2-logrotate` filling the disk                 | Logs not rotating                                  | `pm2 install pm2-logrotate; pm2 set pm2-logrotate:max_size 50M; pm2 set pm2-logrotate:retain 7` |

When stuck, the CloudWatch Logs view of `rathinam-api.err.log` plus `journalctl -u nginx` covers ~95% of issues.

---

## 9. Appendix

### Quick reference — frequently used commands

```bash
# SSH
ssh -i ~/.ssh/rathinam.pem ec2-user@<elastic-ip>

# Pull latest secrets (after rotation in Secrets Manager)
sudo /usr/local/bin/pull-secrets.sh && pm2 reload all

# Tail logs
pm2 logs api --lines 100
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log

# Restart everything
pm2 reload all && sudo systemctl reload nginx

# Manual DB backup right now
sudo /usr/local/bin/db-backup.sh

# DB shell
set -a && . /opt/rathinam/.env && set +a
psql "$DATABASE_URL"
```

### nginx with HSTS + security headers

After certbot generates the 443 server, add inside the `server { listen 443 …; }` block:

```nginx
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
add_header X-Content-Type-Options    "nosniff" always;
add_header X-Frame-Options           "SAMEORIGIN" always;
add_header Referrer-Policy           "strict-origin-when-cross-origin" always;
add_header Permissions-Policy        "geolocation=(), camera=(), microphone=()" always;
```

### Estimated bill of materials (Path A, Mumbai, May 2026)

| Item                          | Monthly INR (approx) |
| ----------------------------- | -------------------- |
| EC2 t4g.small on-demand       |   1 200              |
| EBS 30 GB gp3                 |     250              |
| Elastic IP (in-use)           |       0              |
| RDS db.t4g.small Single-AZ    |   1 800              |
| RDS storage 50 GB gp3         |     500              |
| RDS backup storage (free up to DB size) | 0          |
| Data transfer out (1 GB/day)  |     250              |
| Route 53 hosted zone          |      50              |
| Secrets Manager (1 secret)    |      35              |
| CloudWatch logs/metrics       |     200              |
| S3 backups (≤ 5 GB)           |      30              |
| **Total**                     | **~ ₹ 4 300**        |

(Add ~₹ 1 800 for Multi-AZ RDS, ~₹ 800 for the second EC2 if you ever scale horizontally on Path A.)

---

You now have everything you need: provisioning, build, run, HTTPS, monitoring, backups, rollback, security, cost. Walk through `PRODUCTION.md` § 2 (rotate passwords, real company info, master data, opening stock, CMS pages) and § 3 (smoke test) on the live URL. Once green, point your customers at it.

---

## Single-command install (Amazon Linux 2023)

For zero-touch provisioning of a fresh EC2 box, use `deploy/install.sh`. It
installs every system dependency, generates `SESSION_SECRET` and
`JWT_SECRET`, writes `/etc/ratinam.env` (chmod 0600), clones this repo,
builds all 5 artifacts, pushes the Drizzle schema, configures nginx for the
five subdomains, and requests Let's Encrypt certificates — all in one go.

```bash
sudo APP_DOMAIN=rathinamcracker.com \
     ACME_EMAIL=admin@rathinamcracker.com \
     GITHUB_REPO_URL=https://github.com/abhijeetpandeywork/crackers.git \
     GITHUB_TOKEN=ghp_xxx \
     bash deploy/install.sh
```

The script is idempotent — re-run it on every release.

## Subdomain layout

| Subdomain                     | Serves                          | Source                |
| ----------------------------- | ------------------------------- | --------------------- |
| `rathinamcracker.com` / `www.`| Public storefront               | `artifacts/website`   |
| `api.rathinamcracker.com`     | Express REST API + `/uploads/`  | PM2 `ratinam-api`     |
| `erp.rathinamcracker.com`     | ERP admin panel                 | `artifacts/erp`       |
| `pos.rathinamcracker.com`     | POS terminal                    | `artifacts/pos`       |
| `wh.rathinamcracker.com`      | Warehouse dashboard             | `artifacts/warehouse` |

DNS: create A / AAAA records for each subdomain pointing to the EC2
instance's public IP / IPv6. Wait for propagation before running install.sh
(or pass `--skip-cert` and run `certbot` manually later).

## RBAC at a glance (production)

Roles: `SUPER_ADMIN`, `ADMIN`, `ERP_MANAGER`, `MANAGER`, `ACCOUNTANT`,
`AGENT`, `WH_MANAGER`, `CASHIER`, `API_TOKEN`. Backend write routes are
gated with `requireRole(...GROUP)` and the ERP sidebar / `ProtectedRoute`
filter exactly the same role lists, so a cashier signing in to the ERP
sees only the screens they can actually act on. The new `/system/demo`
page (SUPER_ADMIN only) lets you reset / seed transactional data
between demos without touching your master catalog.
