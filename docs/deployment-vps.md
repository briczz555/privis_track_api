# Deployment VPS — Cloudflare Tunnel → NPM → PriVis Track API

Dokumen ini menyesuaikan setup server yang sudah berjalan (Cloudflare Tunnel +
Nginx Proxy Manager di `~/server-infra`) dengan stack `privis_track_api`.

## 1. Topologi

```
Internet
  │  https://privis.briczz.my.id (TLS di Cloudflare)
  ▼
cloudflared (container, network: default)
  │  http://npm:80
  ▼
Nginx Proxy Manager (default + proxy-net)
  │  http://privis-track-api:3000
  ▼
privis-track-api (default + proxy-net)
  ├── postgres:5432 (internal)
  └── minio:9000   (internal)
```

- Tidak ada port API/DB/MinIO yang diekspos ke publik.
- `privis-track-api` hanya listen `127.0.0.1:3000` di host (debug), akses publik lewat NPM.
- MinIO console tidak dipublikasikan; akses via SSH tunnel.

## 2. Prasyarat di VPS

Network `proxy-net` sudah dibuat oleh `server-infra`:

```bash
docker network ls | grep proxy-net
# kalau belum ada:
docker network create proxy-net
```

Clone repo backend dan siapkan env:

```bash
git clone <repo-url> privis_track_api
cd privis_track_api
cp .env.example .env
nano .env
```

Wajib diganti di `.env`: `POSTGRES_PASSWORD`, `MINIO_ROOT_PASSWORD`,
`JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` (`openssl rand -hex 32`).

## 3. Cloudflare Tunnel

Di Cloudflare Zero Trust → Networks → Tunnels → tunnel yang dipakai → **Public Hostname**:

| Field | Nilai |
|---|---|
| Subdomain | `privis` |
| Domain | `briczz.my.id` |
| Service | `http://npm:80` |

Catatan:

- `cloudflared` dan `npm` berada di network `default` yang sama, sehingga `npm` bisa dipakai sebagai hostname.
- Alternatif: `http://host.docker.internal:80` (sudah ada `extra_hosts` di compose server-infra).
- Jangan arahkan langsung ke `privis-track-api:3000`; biarkan NPM yang menangani routing.

Cloudflare SSL/TLS:

- **Always Use HTTPS: ON**
- **SSL/TLS mode: Full**
- Cache bypass untuk `/v1/*` (API tidak boleh di-cache).
- Opsional WAF rate limit: `/v1/auth/login` 5 request/menit/IP.

## 4. Nginx Proxy Manager

Buat **Proxy Host**:

| Tab | Field | Nilai |
|---|---|---|
| Details | Domain Names | `privis.briczz.my.id` |
| Details | Scheme | `http` |
| Details | Forward Hostname / IP | `privis-track-api` |
| Details | Forward Port | `3000` |
| Details | Block Common Exploits | ON |
| Details | Websockets Support | OFF |
| SSL | SSL Certificate | None (TLS diterminasi Cloudflare) |
| SSL | Force SSL | OFF |
| Advanced | Custom Nginx Configuration | lihat di bawah |

```nginx
client_max_body_size 25m;
proxy_read_timeout 120s;
proxy_send_timeout 120s;
proxy_buffering off;
```

- `proxy_buffering off` membantu streaming download dokumen.
- Jangan aktifkan Force SSL di NPM; Cloudflare sudah mengarahkan HTTP → HTTPS dan tunnel memakai HTTP internal.

## 5. Backend compose

`docker-compose.yml` sudah disiapkan:

```yaml
services:
  api:
    container_name: privis-track-api
    networks: [default, proxy-net]
    ports: ["127.0.0.1:3000:3000"]
```

Jalankan:

```bash
./build.sh
```

Perintah `build.sh` melakukan: pull branch `main`, build image, migrate database,
restart container, prune image lama, lalu healthcheck `http://127.0.0.1:3000/health`.
Seed awal (sekali saja):

```bash
SEED=1 ./build.sh
```

Manual (jika tidak memakai script):

```bash
docker compose up -d --build
docker compose --profile tools run --rm migrate
docker compose --profile tools run --rm seed
```

Verifikasi dari VPS:

```bash
curl -I http://127.0.0.1:3000/health
docker compose ps
docker compose logs -f api
```

Verifikasi dari luar:

```bash
curl -I https://privis.briczz.my.id/health
```

## 6. Base URL

| Keperluan | Nilai |
|---|---|
| API | `https://privis.briczz.my.id/v1` |
| Health | `https://privis.briczz.my.id/health` |
| Swagger | `https://privis.briczz.my.id/docs` (batasi akses) |
| Flutter | `--dart-define=API_BASE_URL=https://privis.briczz.my.id/v1` |
| MinIO | internal; console via `ssh -L 9001:127.0.0.1:9001 briczz@vps` |

Env terkait di `.env`:

```env
APP_BASE_URL=https://privis.briczz.my.id
TRUST_PROXY=1
```

`TRUST_PROXY` penting agar rate limit/logging membaca `CF-Connecting-IP`, bukan IP tunnel.

## 7. Backup (wajib, server laptop)

PostgreSQL:

```bash
docker compose exec -T postgres pg_dump -U privis -d privis_track \
  | gzip > "backup-privis-$(date +%F).sql.gz"
```

MinIO (contoh memakai rclone container, arahkan ke R2/B2):

```bash
docker run --rm \
  -e RCLONE_CONFIG=/config/rclone.conf \
  -v "$PWD/rclone.conf:/config/rclone.conf:ro" \
  rclone/rclone sync :s3:privis-documents remote:privis-documents
```

Simpan backup di luar laptop (object storage lain), dan uji restore secara berkala.

## 8. Troubleshooting

| Gejala | Penyebab umum | Solusi |
|---|---|---|
| 502 Bad Gateway | API belum jalan / nama container salah | `docker compose ps`, cek `privis-track-api:3000` dari container NPM |
| 413 Request Entity Too Large | Batas NPM/Cloudflare | `client_max_body_size 25m`, maks 100 MB di Cloudflare free |
| 504 Gateway Timeout | Upload/download lama | naikkan `proxy_read_timeout`, cek koneksi laptop |
| 401 berulang | Jam server/token | cek waktu sistem (`timedatectl`), refresh token rotation |
| 404 dari NPM | Forward host/port salah | pastikan `privis-track-api` + `3000`, network `proxy-net` |
| Semua request dari IP sama | trust proxy | set `TRUST_PROXY=1`, gunakan `CF-Connecting-IP` |
| MinIO tidak bisa diakses dari HP | memang internal | download lewat API (`/documents/{id}/download`) |

## 9. Keamanan & operasional

- Jangan publish port `3000`, `5433`, `9000`, `9001` ke publik.
- `/docs` nonaktif di produksi atau dilindungi Cloudflare Access (jangan seluruh `/v1`).
- Gunakan service account S3 khusus untuk API (bukan root MinIO) saat implementasi upload.
- Monitor uptime lewat Cloudflare/healthcheck; laptop lama perlu UPS dan pengaturan auto-restart.
- Update image secara berkala (MinIO dipin digest Chainguard; ganti digest di `.env`).
