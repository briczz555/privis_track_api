#!/usr/bin/env bash
#
# Deploy/update PriVis Track API di VPS.
#
# Penggunaan:
#   ./build.sh                 # branch main, cache build aktif
#   ./build.sh develop         # branch lain
#   NO_CACHE=1 ./build.sh      # rebuild image tanpa cache
#   SEED=1 ./build.sh          # jalankan seed setelah migration (sekali saja)
#   FORCE=1 ./build.sh         # izinkan .env yang masih berisi placeholder
#
# PERINGATAN:
# - Script melakukan `git reset --hard origin/<branch>` (perubahan lokal di server
#   akan hilang). Jangan edit file langsung di server.
# - `SEED=1` akan mereset password user seed ke SEED_DEFAULT_PASSWORD.
#
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$APP_DIR"

BRANCH="${1:-main}"
NO_CACHE="${NO_CACHE:-0}"
RUN_SEED="${SEED:-0}"
FORCE="${FORCE:-0}"

log() {
  printf '\n==> %s\n' "$*"
}

fail() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

http_get() {
  if command -v curl >/dev/null 2>&1; then
    curl -fsS "$1"
  else
    wget -qO- "$1"
  fi
}

# --- Preflight ---------------------------------------------------------------

command -v docker >/dev/null 2>&1 || fail "Docker belum terpasang."
docker compose version >/dev/null 2>&1 || fail "Docker Compose v2 belum tersedia."
command -v git >/dev/null 2>&1 || fail "git belum terpasang."

[ -f .env ] || fail ".env tidak ditemukan. Salin dari .env.example lalu isi secret."

if grep -Eq 'ganti-dengan|ubah-password|ubah-secret' .env && [ "$FORCE" != "1" ]; then
  fail ".env masih berisi placeholder (ganti-dengan/ubah-...). Perbaiki dulu, atau jalankan dengan FORCE=1."
fi

if [ "$RUN_SEED" = "1" ]; then
  seed_password="$(grep -E '^SEED_DEFAULT_PASSWORD=' .env | tail -n 1 | cut -d= -f2- || true)"
  if [ -z "$seed_password" ] || [ "$seed_password" = "Privis123!" ]; then
    fail "SEED_DEFAULT_PASSWORD belum di-set atau masih default. Isi password kuat di .env sebelum SEED=1."
  fi
fi

docker network inspect proxy-net >/dev/null 2>&1 \
  || fail "Network 'proxy-net' tidak ditemukan. Buat dengan: docker network create proxy-net"

git rev-parse --verify "origin/$BRANCH" >/dev/null 2>&1 \
  || fail "Branch 'origin/$BRANCH' tidak ditemukan."

# --- 1. Update kode ----------------------------------------------------------

log "[1/6] Ambil kode terbaru dari branch '$BRANCH'"
git fetch origin "$BRANCH"
git checkout "$BRANCH"
git reset --hard "origin/$BRANCH"
echo "Commit: $(git rev-parse --short HEAD) - $(git log -1 --pretty=%s)"

# --- 2. Validasi compose -----------------------------------------------------

log "[2/6] Validasi konfigurasi Docker Compose"
docker compose config --quiet

# --- 3. Build ----------------------------------------------------------------

log "[3/6] Build image Docker"
if [ "$NO_CACHE" = "1" ]; then
  docker compose build --no-cache
else
  docker compose build
fi

# --- 4. Migration ------------------------------------------------------------

log "[4/6] Jalankan migration database"
docker compose --profile tools run --rm migrate

if [ "$RUN_SEED" = "1" ]; then
  log "[4b/6] Seed data contoh (SEED_DEFAULT_PASSWORD / default Privis123!)"
  docker compose --profile tools run --rm seed
  echo "PENTING: ganti password user seed setelah login pertama."
fi

# --- 5. Restart --------------------------------------------------------------

log "[5/6] Restart container dengan image baru"
docker compose up -d --remove-orphans
docker image prune -f >/dev/null

# --- 6. Health check ---------------------------------------------------------

log "[6/6] Cek health API"
for attempt in $(seq 1 45); do
  if http_get "http://127.0.0.1:3000/health" >/dev/null 2>&1; then
    echo "API sehat: $(http_get http://127.0.0.1:3000/health)"
    break
  fi

  if [ "$attempt" -eq 45 ]; then
    echo "API tidak sehat setelah 90 detik. Log terakhir:" >&2
    docker compose logs --tail=40 api >&2
    exit 1
  fi

  sleep 2
done

docker compose ps

echo
echo "Selesai. Branch: $BRANCH | commit: $(git rev-parse --short HEAD)"
echo "Lihat log: docker compose logs -f api"
