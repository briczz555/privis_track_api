#!/usr/bin/env bash
#
# Backup harian PriVis Track:
#   - pg_dump PostgreSQL -> database.sql.gz
#   - mirror bucket MinIO -> folder minio/
#   - arsip tar.gz + manifest
#   - upload ke remote rclone (opsional)
#   - retensi lokal & remote
#   - ping healthchecks.io + webhook notifikasi (opsional)
#
# Jalankan dari root repo (cron):
#   15 2 * * * cd /root/privis_track_api && ./scripts/backup.sh >> /var/log/privis-backup.log 2>&1
#
set -Eeuo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_DIR"

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi
if [ -f backup.env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./backup.env
  set +a
fi

BACKUP_DIR="${BACKUP_DIR:-$APP_DIR/backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-7}"
REMOTE="${BACKUP_REMOTE:-}"
REMOTE_RETENTION_DAYS="${BACKUP_REMOTE_RETENTION_DAYS:-30}"
PING_URL="${BACKUP_PING_URL:-}"
ALERT_URL="${ALERT_WEBHOOK_URL:-}"

TIMESTAMP="$(date +%Y-%m-%d_%H%M%S)"
WORK_DIR="$BACKUP_DIR/$TIMESTAMP"
ARCHIVE="$BACKUP_DIR/privis-$TIMESTAMP.tar.gz"
LOG_FILE="$BACKUP_DIR/backup.log"
LOCK_FILE="$BACKUP_DIR/.backup.lock"

mkdir -p "$BACKUP_DIR"
if command -v flock >/dev/null 2>&1; then
  exec 9>"$LOCK_FILE"
  if ! flock -n 9; then
    echo "Backup lain sedang berjalan; dilewati."
    exit 0
  fi
else
  LOCK_DIR="$BACKUP_DIR/.backup.lock.d"
  if ! mkdir "$LOCK_DIR" 2>/dev/null; then
    echo "Backup lain sedang berjalan; dilewati."
    exit 0
  fi
  trap 'rmdir "$LOCK_DIR" 2>/dev/null || true' EXIT
fi

log() {
  printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" | tee -a "$LOG_FILE"
}

notify() {
  [ -n "$ALERT_URL" ] || return 0
  local message="$1" escaped
  escaped="$(printf '%s' "$message" | sed 's/\\/\\\\/g; s/"/\\"/g')"
  curl -fsS -m 10 \
    -H 'Content-Type: application/json' \
    -d "{\"text\":\"$escaped\",\"content\":\"$escaped\"}" \
    "$ALERT_URL" >/dev/null 2>&1 || true
}

ping_healthcheck() {
  [ -n "$PING_URL" ] || return 0
  curl -fsS -m 10 "$1" >/dev/null 2>&1 || true
}

on_error() {
  local code=$?
  log "Backup GAGAL (exit $code)."
  notify "PriVis backup GAGAL di $(hostname) (exit $code). Cek $LOG_FILE."
  ping_healthcheck "${PING_URL%/}/fail"
  exit "$code"
}
trap on_error ERR

log "Mulai backup PriVis Track..."
log "Commit: $(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
mkdir -p "$WORK_DIR/minio"

log "Dump PostgreSQL..."
docker compose exec -T postgres pg_dump \
  -U "${POSTGRES_USER:-privis}" \
  -d "${POSTGRES_DB:-privis_track}" \
  --no-owner --no-privileges \
  | gzip >"$WORK_DIR/database.sql.gz"

log "Mirror bucket MinIO..."
BACKUP_MIRROR_DIR="$WORK_DIR/minio" \
  docker compose --profile tools run --rm -T backup-mirror

{
  echo "timestamp=$TIMESTAMP"
  echo "host=$(hostname)"
  echo "git_commit=$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
  echo "bucket=${MINIO_BUCKET:-privis-documents}"
  echo "database_bytes=$(wc -c <"$WORK_DIR/database.sql.gz" | tr -d ' ')"
  echo "minio_files=$(find "$WORK_DIR/minio" -type f | wc -l | tr -d ' ')"
} >"$WORK_DIR/manifest.txt"

log "Membuat arsip..."
tar --force-local -czf "$ARCHIVE" -C "$BACKUP_DIR" "$TIMESTAMP"
rm -rf "$WORK_DIR"

if [ -n "$REMOTE" ]; then
  if ! command -v rclone >/dev/null 2>&1; then
    log "rclone tidak ditemukan; backup lokal tersimpan, upload offsite dilewati."
    false
  fi

  log "Upload ke $REMOTE ..."
  rclone copy "$ARCHIVE" "$REMOTE/" --stats-one-line

  log "Retensi remote ${REMOTE_RETENTION_DAYS} hari..."
  rclone delete "$REMOTE" \
    --include "privis-*.tar.gz" \
    --min-age "${REMOTE_RETENTION_DAYS}d" || true
  rclone rmdirs "$REMOTE" --leave-root || true
fi

log "Retensi lokal ${RETENTION_DAYS} hari..."
find "$BACKUP_DIR" -maxdepth 1 -type f -name 'privis-*.tar.gz' \
  -mtime +"$RETENTION_DAYS" -print -delete

trap - ERR
log "Backup selesai: $ARCHIVE"
ping_healthcheck "$PING_URL"
