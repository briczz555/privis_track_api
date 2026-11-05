# PriVis Track API

Backend Fase 2 untuk aplikasi **PriVis Track** — NestJS 12 + Prisma + PostgreSQL + MinIO (S3-compatible).

**Status:** skeleton/scaffold. Endpoint bisnis (auth, projects, dashboard, documents) **belum diimplementasikan** — menunggu review kontrak API.

- Kontrak API (draft): `../privis_track/docs/api-contract.md` dan `../privis_track/docs/openapi.yaml`
  (masih berada di repo aplikasi Flutter untuk review; setelah disetujui dipindahkan ke `docs/` repo ini)
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

## Struktur

```
privis_track_api/
├── prisma/
│   └── schema.prisma       # skema awal (menunggu approval; belum dimigrasikan)
├── src/                    # NestJS (masih template)
├── test/
├── prisma.config.ts
├── docker-compose.yml      # api + postgres + minio + minio-init + migrate
├── Dockerfile              # multi-stage (deps → build → runtime)
└── .env.example
```

## Menjalankan lokal

Prasyarat: Node 24+, npm, Docker.

```bash
cp .env.example .env          # Windows: copy .env.example .env
# sesuaikan password/secret di .env

npm install

# Jalankan PostgreSQL + MinIO (bucket dibuat otomatis)
docker compose up -d postgres minio

# Setelah skema disetujui: buat migration pertama
npx prisma migrate dev --name init

npm run start:dev             # http://localhost:3000
```

- PostgreSQL dari host: `localhost:5433` (port 5433 dipakai agar tidak bentrok dengan PostgreSQL lokal; ubah di `docker-compose.yml` + `DATABASE_URL` bila perlu).
- Cek bucket: MinIO console di http://localhost:9001 (kredensial dari `.env`). Bucket `privis-documents` dibuat otomatis lewat `MINIO_DEFAULT_BUCKETS`.
- Image MinIO resmi sudah tidak tersedia publik (Docker Hub 404, Quay 401, binary `dl.min.io` 410). Default compose memakai image komunitas terakhir Bitnami legacy; ganti `MINIO_IMAGE` di `.env` jika punya akses ke image MinIO resmi/mirror.

## Deploy di VPS (Docker)

```bash
git clone <repo-url> privis_track_api
cd privis_track_api
cp .env.example .env
# edit .env → password Postgres/MinIO, JWT secret (openssl rand -hex 32)

docker compose up -d --build

# Setelah migration tersedia (sekali saja / setiap ada migration baru):
docker compose --profile tools run --rm migrate
```

- API: `http://<ip-vps>:3000`
- Postgres & MinIO sengaja di-bind ke `127.0.0.1` (tidak terekspos publik).
- Untuk produksi, pasang reverse proxy (Nginx/Traefik/Caddy) + HTTPS ke port 3000.
  MinIO juga perlu domain + TLS jika signed URL akan diakses langsung dari HP
  (`MINIO_PUBLIC_URL`).
- Backup: volume `postgres_data` dan `minio_data`.

## Perintah penting

```bash
npm run start:dev          # dev server (watch)
npm run build              # compile ke dist/
npm run start:prod         # jalankan hasil build (node dist/main.js)
npx prisma validate        # validasi schema
npx prisma studio          # GUI database
npx prisma migrate dev     # migration saat development
npx prisma migrate deploy  # migration di server/produksi
```

## Environment

Lihat `.env.example`. Variabel utama:

| Variable | Fungsi |
|---|---|
| `DATABASE_URL` | koneksi PostgreSQL (di Docker Compose di-override ke host `postgres`) |
| `MINIO_*` | endpoint, kredensial, bucket, public URL |
| `MINIO_IMAGE` | override image MinIO (default Bitnami legacy) |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | secret token (wajib diganti) |
| `MAX_UPLOAD_MB` | batas ukuran upload (default 20) |
| `PORT` | port API (default 3000) |

## Langkah berikutnya (setelah kontrak disetujui)

1. Module `prisma` + `PrismaService`.
2. Migration awal + seed user/admin dan data contoh.
3. Auth (login/refresh/logout, bcrypt/argon2, refresh token rotation).
4. Endpoints `/dashboard`, `/projects`, `/projects/:id` (read-only).
5. Upload/download dokumen ke MinIO + pencatatan aktivitas.
6. OpenAPI (`/docs`) + e2e test + CI.
7. Baru setelah itu: wiring Dio di aplikasi Flutter.
