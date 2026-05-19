#!/usr/bin/env bash
# Nightly backup of the Postgres database.
#
# Cron entry (run as the deploy user):
#   0 2 * * * /var/www/ratinam/deploy/scripts/backup.sh >> /var/log/ratinam/backup.log 2>&1
#
# Required environment (source /etc/ratinam.env first):
#   DATABASE_URL              postgres://...
#   BACKUP_DIR                local dir (default /var/backups/ratinam)
#   BACKUP_S3_BUCKET          (optional) s3://my-bucket/ratinam — needs awscli + IAM
#   BACKUP_RETENTION_DAYS     default 14

set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/ratinam}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
mkdir -p "$BACKUP_DIR"

STAMP="$(date -u +%Y%m%d_%H%M%S)"
FILE="$BACKUP_DIR/ratinam_${STAMP}.sql.gz"

echo "[$(date -Iseconds)] dumping → $FILE"
pg_dump --no-owner --no-privileges --format=plain "$DATABASE_URL" | gzip -9 > "$FILE"

SIZE=$(du -h "$FILE" | cut -f1)
echo "[$(date -Iseconds)] dump complete ($SIZE)"

if [[ -n "${BACKUP_S3_BUCKET:-}" ]]; then
  echo "[$(date -Iseconds)] uploading to $BACKUP_S3_BUCKET"
  aws s3 cp "$FILE" "$BACKUP_S3_BUCKET/$(basename "$FILE")" --only-show-errors
fi

echo "[$(date -Iseconds)] pruning local backups older than ${RETENTION_DAYS}d"
find "$BACKUP_DIR" -name 'ratinam_*.sql.gz' -mtime +"$RETENTION_DAYS" -delete

echo "[$(date -Iseconds)] done"
