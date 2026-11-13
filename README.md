# PriVis Track API

Backend Fase 2 untuk aplikasi **PriVis Track** — NestJS 12 + Prisma + PostgreSQL + MinIO (S3-compatible).

**Status:** auth, endpoint baca, upload/download/hapus dokumen, PATCH proyek/tahap, ganti password, hardening, manajemen user, serta audit log admin sudah berjalan. Operasional backup/monitoring tersedia lewat skrip.

- Kontrak API (draft): `../privis_track/docs/api-contract.md` dan `../privis_track/docs/openapi.yaml`
  (masih berada di repo aplikasi Flutter untuk review; setelah disetujui dipindahkan ke `docs/` repo ini)
- Panduan deploy VPS (Cloudflare Tunnel → NPM → API): [`docs/deployment-vps.md`](docs/deployment-vps.md)
- Backup, restore, dan monitoring: [`docs/backup-restore.md`](docs/backup-restore.md)
- Aplikasi Flutter: `../privis_track`

## Stack

| Komponen | Versi / Catatan |
|---|---|
| NestJS | 12 (ESM, TypeScript 6, Vitest) |
| Prisma | 6.19 (`prisma-client-js`, PostgreSQL) |
| Node | 24 (Docker image `node:24-alpine`) |
| Database | PostgreSQL 16 |
| Object storage | MinIO (kompatibel S3) |
| Container | Docker + Docker Compose |

## Endpoint yang tersedia

| Method | Path | Auth | Keterangan |
|---|---|---|---|
| GET | `/health` | publik | healthcheck Docker |
| POST | `/v1/auth/login` | publik | login, mengembalikan access + refresh token |
| POST | `/v1/auth/refresh` | publik | rotasi refresh token |
| POST | `/v1/auth/logout` | publik | cabut refresh token |
| GET | `/v1/me` | bearer | profil user |
| GET | `/v1/dashboard` | bearer | agregat portfolio, proyek aktif, aktivitas |
| GET | `/v1/projects` | bearer | daftar proyek + filter/pagination + status_counts |
| POST | `/v1/projects` | admin/pm | buat proyek + 8 tahap + klien |
| GET | `/v1/clients` | bearer | daftar klien untuk dropdown |
| GET | `/v1/projects/{code}` | bearer | detail proyek + klien + 8 tahap + dokumen |
| GET | `/v1/activities` | bearer | feed aktivitas (cursor) |
| POST | `/v1/projects/{code}/stages/{stage_no}/documents` | bearer | upload multipart (maks 20 MB) |
| GET | `/v1/projects/{code}/stages/{stage_no}/documents` | bearer | daftar dokumen tahap |
| GET | `/v1/documents/{id}/download` | bearer | download stream (Range support) |
| DELETE | `/v1/documents/{id}` | admin/pm | soft delete dokumen |
| PATCH | `/v1/projects/{code}` | admin/pm | ubah nama/tanggal/status/klien |
| PATCH | `/v1/projects/{code}/stages/{stage_no}` | admin/pm | tandai selesai / buka kembali tahap |
| POST | `/v1/auth/change-password` | bearer | ganti password + rotasi sesi |
| GET | `/v1/users` | admin | daftar user internal |
| POST | `/v1/users` | admin | tambah user |
| PATCH | `/v1/users/{id}` | admin | ubah nama/role/divisi/status aktif |
| POST | `/v1/users/{id}/reset-password` | admin | reset password + cabut semua sesi user |
| GET | `/v1/audit-logs` | admin | riwayat aksi admin (pagination) |

Belum tersedia: —.

Dokumentasi interaktif: `http://<host>/docs` (Swagger UI) dan `/docs-json`
(OpenAPI 3). Nonaktifkan dengan `SWAGGER_ENABLED=false` bila tidak diperlukan.
Rate limit: 120 request/menit/IP untuk seluruh API dan 5 percobaan login/menit/IP
(respons `429 rate_limited`).

## Login hasil seed (development)

```
admin@privis.id   / Privis123!   (admin)
rina@privis.id    / Privis123!   (pm)
finance@privis.id / Privis123!   (finance)
qa@privis.id      / Privis123!   (qa)
```

Password default bisa diubah lewat `SEED_DEFAULT_PASSWORD`. **Ganti sebelum production.**

## Menjalankan lokal

Prasyarat: Node 24+, npm, Docker.

```bash
cp .env.example .env          # Windows: copy .env.example .env
# sesuaikan password/secret di .env

npm install

# Sekali saja agar API bisa join network yang sama dengan NPM:
docker network create proxy-net

# Infra: PostgreSQL + MinIO (bucket dibuat otomatis oleh minio-init)
docker compose up -d postgres minio minio-init

# Migration + seed
npx prisma migrate deploy
npx prisma db seed

npm run start:dev             # http://localhost:3000
```

- PostgreSQL dari host: `localhost:5433` (port 5433 dipakai agar tidak bentrok dengan PostgreSQL lokal).
- MinIO console: http://localhost:9001 (kredensial dari `.env`); bucket `privis-documents` privat.
- API hanya listen `127.0.0.1:3000` di host; akses publik lewat NPM/Cloudflare Tunnel.

## Deploy di VPS (Docker)

Cara singkat (disarankan):

```bash
cd ~/privis_track_api
./build.sh            # pull, build, migrate, restart, healthcheck
```

Seed awal cukup sekali:

```bash
SEED=1 ./build.sh
```

Opsi lain:

```bash
NO_CACHE=1 ./build.sh      # rebuild tanpa cache
./build.sh develop         # deploy branch lain
FORCE=1 ./build.sh         # izinkan .env dengan placeholder (tidak disarankan)
```

Atau manual:

```bash
git pull
docker compose up -d --build
docker compose --profile tools run --rm migrate
docker compose --profile tools run --rm seed
```

Seed di production diblokir kecuali `SEED_ALLOW_PRODUCTION=true` (service `seed`
sudah men-set-nya) dan `SEED_DEFAULT_PASSWORD` di-set. **Ganti password default
setelah login pertama**; jangan biarkan kredensial contoh aktif.

## Perintah penting

```bash
npm run start:dev          # dev server (watch)
npm run build              # compile ke dist/
npm run start:prod         # node dist/main.js
npx prisma validate        # validasi schema
npx prisma studio          # GUI database
npx prisma migrate dev     # migration saat development
npx prisma migrate deploy  # migration di server/produksi
npx prisma db seed         # seed data contoh
npm test                   # unit test (Vitest)
npm run test:e2e           # e2e (butuh PostgreSQL berjalan)
```

## Struktur

```
privis_track_api/
├── prisma/
│   ├── schema.prisma       # skema database
│   ├── migrations/         # migration SQL
│   └── seed.ts             # data contoh (user, klien, proyek, dokumen, aktivitas)
├── src/
│   ├── activities/         # feed aktivitas + cursor
│   ├── auth/               # login, refresh, logout, JWT strategy
│   ├── common/             # guard, filter, decorator, interceptor
│   ├── config/             # validasi env (zod)
│   ├── dashboard/          # agregat dashboard
│   ├── health/             # /health
│   ├── prisma/             # PrismaModule/Service
│   └── projects/           # daftar & detail proyek, mapper progres
├── docs/deployment-vps.md
├── deploy/minio-policy.json # policy least-privilege akun layanan MinIO
├── prisma.config.ts
├── docker-compose.yml      # api + postgres + minio + init (bucket/akun) + migrate
├── Dockerfile              # multi-stage
└── .env.example
```

## Environment

Lihat `.env.example`. Variabel utama:

| Variable | Fungsi |
|---|---|
| `DATABASE_URL` | koneksi PostgreSQL (di Docker Compose di-override ke host `postgres`) |
| `MINIO_*` | endpoint, kredensial, bucket, public URL |
| `MINIO_IMAGE` | override image MinIO (default Chainguard, dipin digest) |
| `MINIO_CLIENT_IMAGE` | image `mc` untuk init akun layanan (default Chainguard) |
| `MINIO_API_USER`, `MINIO_API_PASSWORD` | akun layanan MinIO yang dipakai API (dibuat otomatis) |
| `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY` | kredensial S3 proses API (diisi Compose dari akun layanan) |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | secret token (wajib diganti) |
| `JWT_ACCESS_TTL`, `JWT_REFRESH_TTL` | masa berlaku token (detik) |
| `MAX_UPLOAD_MB` | batas upload (default 20) |
| `SWAGGER_ENABLED` | aktif/nonaktifkan dokumentasi `/docs` (default `true`) |
| `TRUST_PROXY` | jumlah hop proxy (1 untuk Cloudflare Tunnel + NPM) |
| `APP_BASE_URL` | URL publik API |
| `SEED_DEFAULT_PASSWORD` | password seed development |
| `SEED_ALLOW_PRODUCTION` | izinkan seed di production (default tidak) |

## Backup & monitoring

Backup harian PostgreSQL + MinIO, upload offsite via rclone, dan monitoring
health/usia backup/disk:

```bash
cp backup.env.example backup.env   # isi BACKUP_DIR, BACKUP_REMOTE, dll.
chmod 600 backup.env
./scripts/backup.sh
./scripts/monitor.sh
```

Detail konfigurasi rclone, cron, notifikasi, dan prosedur restore:
[`docs/backup-restore.md`](docs/backup-restore.md).

## Langkah berikutnya

1. Opsional: migrasi cache offline ke bulk sync `GET /v1/sync` bila data membesar.
2. Operasional: uji restore backup secara berkala dan pasang alert Healthchecks/webhook.
3. Evaluasi kebutuhan baru di luar cakupan v1.
