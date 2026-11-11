# PriVis Track API

Backend Fase 2 untuk aplikasi **PriVis Track** — NestJS 12 + Prisma + PostgreSQL + MinIO (S3-compatible).

**Status:** auth, endpoint baca, upload/download, hapus dokumen, serta PATCH proyek/tahap sudah berjalan. Tinggal hardening (rate limit, Swagger, magic bytes) dan user management.

- Kontrak API (draft): `../privis_track/docs/api-contract.md` dan `../privis_track/docs/openapi.yaml`
  (masih berada di repo aplikasi Flutter untuk review; setelah disetujui dipindahkan ke `docs/` repo ini)
- Panduan deploy VPS (Cloudflare Tunnel → NPM → API): [`docs/deployment-vps.md`](docs/deployment-vps.md)
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
| GET | `/v1/projects` | bearer | daftar proyek + filter/pagination |
| GET | `/v1/projects/{code}` | bearer | detail proyek + klien + 8 tahap + dokumen |
| GET | `/v1/activities` | bearer | feed aktivitas (cursor) |
| POST | `/v1/projects/{code}/stages/{stage_no}/documents` | bearer | upload multipart (maks 20 MB) |
| GET | `/v1/projects/{code}/stages/{stage_no}/documents` | bearer | daftar dokumen tahap |
| GET | `/v1/documents/{id}/download` | bearer | download stream (Range support) |
| DELETE | `/v1/documents/{id}` | admin/pm | soft delete dokumen |
| PATCH | `/v1/projects/{code}` | admin/pm | ubah status / current_stage / due_date |
| PATCH | `/v1/projects/{code}/stages/{stage_no}` | admin/pm | tandai selesai / buka kembali tahap |

Belum tersedia: ganti password, user management, Swagger runtime, rate limiting login.

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
├── prisma.config.ts
├── docker-compose.yml      # api + postgres + minio + minio-init + migrate
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
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | secret token (wajib diganti) |
| `JWT_ACCESS_TTL`, `JWT_REFRESH_TTL` | masa berlaku token (detik) |
| `MAX_UPLOAD_MB` | batas upload (default 20) |
| `TRUST_PROXY` | jumlah hop proxy (1 untuk Cloudflare Tunnel + NPM) |
| `APP_BASE_URL` | URL publik API |
| `SEED_DEFAULT_PASSWORD` | password seed development |
| `SEED_ALLOW_PRODUCTION` | izinkan seed di production (default tidak) |

## Langkah berikutnya

1. Hardening: rate limiting login, Swagger runtime, validasi magic-bytes upload, service account S3.
2. Endpoint ganti password + user management.
3. Backup offsite otomatis + monitoring uptime.
4. Aksi hapus dokumen & kelola proyek di UI Flutter (endpoint sudah tersedia).
