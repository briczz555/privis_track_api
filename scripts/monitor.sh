#!/usr/bin/env bash
#
# Monitoring ringan untuk PriVis Track:
#   - health API publik dan lokal
#   - usia backup terakhir
#   - penggunaan disk
#   - notifikasi webhook hanya saat status berubah
#
# Cron setiap 15 menit:
#   */15 * * * * cd /root/privis_track_api && ./scripts/monitor.sh >> /var/log/privis-monitor.log 2>&1
#
set -Eeuo pipefail
export PATH="/usr/local/bin:/usr/bin:/bin:${PATH:-}"

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
PUBLIC_HEALTH_URL="${PUBLIC_HEALTH_URL:-https://privis.briczz.my.id/health}"
MAX_AGE_HOURS="${BACKUP_MAX_AGE_HOURS:-26}"
DISK_MAX_PERCENT="${DISK_USAGE_MAX:-85}"
ALERT_URL="${ALERT_WEBHOOK_URL:-}"
MONITOR_PING_URL="${MONITOR_PING_URL:-}"
STATE_FILE="$BACKUP_DIR/.monitor.state"

mkdir -p "$BACKUP_DIR"

failures=()
add_failure() {
  failures+=("$1")
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

if ! curl -fsS -m 15 "$PUBLIC_HEALTH_URL" 2>/dev/null | grep -q '"status":"ok"'; then
  add_failure "Health publik gagal ($PUBLIC_HEALTH_URL)"
fi

if ! curl -fsS -m 10 "http://127.0.0.1:3000/health" 2>/dev/null | grep -q '"status":"ok"'; then
  add_failure "Health API lokal gagal (127.0.0.1:3000)"
fi

latest_backup="$(find "$BACKUP_DIR" -maxdepth 1 -type f -name 'privis-*.tar.gz' \
  -printf '%T@ %p\n' 2>/dev/null | sort -nr | head -n1 | cut -d' ' -f2- || true)"
if [ -z "$latest_backup" ]; then
  add_failure "Belum ada file backup di $BACKUP_DIR"
else
  backup_epoch="$(stat -c %Y "$latest_backup")"
  age_hours=$((($(date +%s) - backup_epoch) / 3600))
  if [ "$age_hours" -gt "$MAX_AGE_HOURS" ]; then
    add_failure "Backup terakhir ${age_hours} jam lalu (maks ${MAX_AGE_HOURS} jam)"
  fi
fi

disk_percent="$(df -P "$BACKUP_DIR" | awk 'NR==2 {gsub("%", "", $5); print $5}')"
if [ -n "$disk_percent" ] && [ "$disk_percent" -gt "$DISK_MAX_PERCENT" ]; then
  add_failure "Disk ${disk_percent}% terpakai (maks ${DISK_MAX_PERCENT}%)"
fi

if [ "${#failures[@]}" -eq 0 ]; then
  current="ok"
else
  current="$(printf '%s | ' "${failures[@]}")"
  current="${current% | }"
fi

previous="$(cat "$STATE_FILE" 2>/dev/null || true)"
if [ "$current" != "$previous" ]; then
  if [ "$current" = "ok" ]; then
    notify "PriVis monitoring PULIH: semua pemeriksaan normal."
  else
    notify "PriVis monitoring GAGAL: $current"
  fi
  printf '%s\n' "$current" >"$STATE_FILE"
fi

if [ "$current" = "ok" ] && [ -n "$MONITOR_PING_URL" ]; then
  curl -fsS -m 10 "$MONITOR_PING_URL" >/dev/null 2>&1 || true
fi

if [ "$current" != "ok" ]; then
  printf 'MONITOR GAGAL: %s\n' "$current" >&2
  exit 1
fi

echo "MONITOR OK"
