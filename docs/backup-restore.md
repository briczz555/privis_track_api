# Backup & Restore PriVis Track

Panduan operasional untuk backup harian PostgreSQL + MinIO, pengiriman offsite,
monitoring, dan restore. Ditujukan untuk VPS/laptop server (`~/privis_track_api`).

## 1. Ringkasan

`scripts/backup.sh` menjalankan:

1. `pg_dump` PostgreSQL → `database.sql.gz`
2. Mirror bucket MinIO → folder `minio/`
3. Membuat `privis-<timestamp>.tar.gz` + `manifest.txt`
4. Upload ke remote rclone (opsional)
5. Retensi lokal & remote
6. Ping Healthchecks.io dan/atau webhook saat sukses/gagal (opsional)

`scripts/monitor.sh` memeriksa health API publik/lokal, usia backup terakhir,
dan pemakaian disk. Notifikasi webhook hanya dikirim saat status berubah
(gagal → pulih atau sebaliknya) agar tidak spam.

## 2. Prasyarat

- Docker Compose stack sudah berjalan minimal sekali (`minio-init` membuat
  bucket dan konfigurasi `mc`). Stack harus aktif saat backup.
- `rclone` terpasang di host jika memakai backup offsite:
  ```bash
  curl https://rclone.org/install.sh | sudo bash
  rclone version
  ```
- Disk untuk `BACKUP_DIR` cukup (minimal 2× ukuran database + dokumen).
- Jalankan sebagai root atau user yang bisa memakai Docker dan menulis
  `BACKUP_DIR`.

## 3. Konfigurasi

```bash
cd ~/privis_track_api
cp backup.env.example backup.env
chmod 600 backup.env
nano backup.env
```

Isi minimal:

```env
BACKUP_DIR=/var/backups/privis-track
BACKUP_RETENTION_DAYS=7
BACKUP_REMOTE_RETENTION_DAYS=30
BACKUP_REMOTE=r2:privis-track-backup
```

`backup.env` berisi konfigurasi non-rahasia. Kredensial offsite disimpan di
`~/.config/rclone/rclone.conf` (`chmod 600`).

### 3.1. Remote rclone

Contoh Cloudflare R2:

```bash
rclone config
# n (new remote)
# name: r2
# storage: s3
# provider: Cloudflare
# access_key_id / secret_access_key dari dashboard R2
# endpoint: https://<ACCOUNT_ID>.r2.cloudflarestorage.com
# region: auto
```

Contoh Backblaze B2:

```bash
rclone config
# n → name: b2 → storage: b2 → masukkan keyID/appKey
```

### 3.2. Google Drive

Google Drive bisa dipakai, tetapi cocok untuk data kecil–menengah. Cek kuota
akun terlebih dahulu:

```bash
rclone about gdrive:
```

> **Penting (2026):** rclone shared `client_id` sedang dipensiunkan. Buat OAuth
> Client ID sendiri; rclone versi baru akan menolak melanjutkan tanpa itu.

#### Membuat OAuth Client ID

1. Buka <https://console.cloud.google.com/> → buat/pilih project.
2. **APIs & Services → Library** → aktifkan **Google Drive API**.
3. **APIs & Services → OAuth consent screen**:
   - User type: **Internal** jika memakai Google Workspace (paling mudah,
     tanpa verifikasi dan token tidak kedaluwarsa 7 hari), atau **External**
     untuk Gmail biasa.
   - Isi nama aplikasi, email pendukung, dan developer contact.
   - Scopes: tambahkan `https://www.googleapis.com/auth/drive`.
   - External: tambahkan akun Google Anda sebagai **Test user**.
   - Setelah selesai, **Publish app** ke Production. Aplikasi berstatus
     *Testing* membuat refresh token kedaluwarsa setiap 7 hari.
4. **APIs & Services → Credentials → Create credentials → OAuth client ID**.
5. Application type: **Desktop app** → Create.
6. Salin **Client ID** dan **Client Secret**.

#### Konfigurasi rclone

```bash
rclone config
# n (new remote)
# name: gdrive
# Storage: drive
# client_id: <Client ID dari Google Cloud>
# client_secret: <Client Secret>
# scope: 1 (drive) — akses penuh ke folder backup
# root_folder_id: kosongkan
# service_account_file: kosongkan
# Edit advanced config: n
```

Jika muncul pertanyaan “Continue using the shared client_id?”, jawab **n** lalu
masukkan Client ID/Secret Anda. Untuk VPS headless, pilih **n** pada
“Use web browser to automatically authenticate”.

rclone akan menampilkan perintah `rclone authorize "drive" ...`. Jalankan
**perintah lengkap yang ditampilkan** (termasuk argumen JSON berisi client ID)
di komputer/HP yang punya browser, login Google, lalu salin token JSON ke VPS.

Alternatif yang lebih mudah: buat remote yang sama di komputer dengan browser,
selesaikan OAuth di sana, lalu salin blok `[gdrive]` dari `rclone.conf` komputer
ke `/root/.config/rclone/rclone.conf` di VPS (`chmod 600`).

Buat folder backup dan uji:

```bash
rclone mkdir gdrive:privis-track-backup
rclone lsd gdrive:privis-track-backup
echo tes | rclone rcat gdrive:privis-track-backup/tes.txt
rclone cat gdrive:privis-track-backup/tes.txt
rclone delete gdrive:privis-track-backup/tes.txt
```

Isi `backup.env`:

```env
BACKUP_REMOTE=gdrive:privis-track-backup
# Wajib untuk Drive agar retensi benar-benar menghapus, bukan masuk trash:
RCLONE_DRIVE_USE_TRASH=false
```

Catatan Google Drive:

- Kuota gratis 15 GB; pastikan `rclone about gdrive:` cukup untuk database +
  seluruh dokumen. Jika tidak, gunakan Google Workspace/Shared Drive atau R2/B2.
- `rclone delete` di Drive secara default memindahkan file ke **trash** dan
  kuota belum berkurang. `RCLONE_DRIVE_USE_TRASH=false` membuat penghapusan
  permanen. Alternatif: `rclone cleanup gdrive:privis-track-backup`.
- Google Drive membatasi upload sekitar 750 GB/hari per akun; backup harian
  normalnya jauh di bawah itu.
- Untuk Shared Drive (Workspace), isi `team_drive` di advanced config atau
  gunakan `RCLONE_DRIVE_SHARED_WITH_ME=true` bila folder dibagikan ke akun.
- Token OAuth disimpan di `rclone.conf`; perlakukan seperti password.
- Untuk backup PII, gunakan rclone crypt di atas Drive (lihat 3.3).

Lalu isi `BACKUP_REMOTE` dengan `nama-remote:nama-bucket`, misalnya
`r2:privis-track-backup`.

Uji:

```bash
rclone lsd r2:
rclone lsd r2:privis-track-backup
```

### 3.3. Enkripsi (disarankan)

Arsip berisi data proyek dan dokumen (PII). Gunakan rclone crypt di atas remote:

```bash
rclone config
# n → name: crypt
# storage: crypt
# remote: r2:privis-track-backup
# password & password2 (simpan di tempat aman!)
```

Set `BACKUP_REMOTE=crypt:privis-track-backup`. Tanpa password crypt, backup
tidak bisa dipulihkan.

## 4. Menjalankan manual

```bash
cd ~/privis_track_api
./scripts/backup.sh
```

Hasil:

```text
/var/backups/privis-track/
├── backup.log
└── privis-2026-11-12_021500.tar.gz
```

Cek isi arsip:

```bash
tar -tzf /var/backups/privis-track/privis-*.tar.gz | head
```

## 5. Jadwal cron

```cron
# Backup harian 02:15
15 2 * * * cd /root/privis_track_api && ./scripts/backup.sh >> /var/log/privis-backup.log 2>&1

# Monitoring tiap 15 menit
*/15 * * * * cd /root/privis_track_api && ./scripts/monitor.sh >> /var/log/privis-monitor.log 2>&1
```

Alternatif systemd timer (lebih mudah diaudit):

```ini
# /etc/systemd/system/privis-backup.service
[Unit]
Description=PriVis Track backup
After=docker.service

[Service]
Type=oneshot
WorkingDirectory=/root/privis_track_api
ExecStart=/root/privis_track_api/scripts/backup.sh
```

```ini
# /etc/systemd/system/privis-backup.timer
[Unit]
Description=Daily PriVis Track backup

[Timer]
OnCalendar=*-*-* 02:15:00
Persistent=true

[Install]
WantedBy=timers.target
```

```bash
systemctl daemon-reload
systemctl enable --now privis-backup.timer
systemctl list-timers privis-backup.timer
```

## 6. Monitoring

`monitor.sh` memeriksa:

- `PUBLIC_HEALTH_URL` (default `https://privis.briczz.my.id/health`)
- `http://127.0.0.1:3000/health`
- Usia backup terakhir ≤ `BACKUP_MAX_AGE_HOURS` (default 26 jam)
- Pemakaian disk ≤ `DISK_USAGE_MAX` (default 85%)

Notifikasi:

- **Healthchecks.io (backup):** buat check periodik 1 hari + grace, isi
  `BACKUP_PING_URL=https://hc-ping.com/<uuid>`. Script ping sukses, dan
  `<url>/fail` saat gagal.
- **Webhook (Slack/Discord):** isi `ALERT_WEBHOOK_URL`. Payload berisi `text`
  dan `content`.
- **Healthchecks (monitor):** isi `MONITOR_PING_URL` (dipanggil saat semua
  pemeriksaan normal).
- **Uptime Kuma:** tambahkan HTTP monitor ke `/health`; tidak perlu webhook.

Uji notifikasi:

```bash
BACKUP_DIR=/tmp/privis-monitor-test ./scripts/monitor.sh
```

## 7. Restore

> Uji restore di lingkungan staging. Jangan menimpa data produksi tanpa backup
> terbaru dan tanpa persetujuan.

### 7.1. Ekstrak arsip

```bash
cd ~/privis_track_api
docker compose stop api

RESTORE_DIR=/tmp/privis-restore
mkdir -p "$RESTORE_DIR"
tar -xzf /var/backups/privis-track/privis-YYYY-MM-DD_HHMMSS.tar.gz -C "$RESTORE_DIR" --strip-components=1
```

### 7.2. Restore PostgreSQL

```bash
docker compose exec -T postgres psql -U privis -d postgres \
  -c "DROP DATABASE IF EXISTS privis_track WITH (FORCE);"
docker compose exec -T postgres psql -U privis -d postgres \
  -c "CREATE DATABASE privis_track OWNER privis;"
gunzip -c "$RESTORE_DIR/database.sql.gz" \
  | docker compose exec -T postgres psql -U privis -d privis_track
```

### 7.3. Restore MinIO

```bash
docker compose run --rm \
  -v "$RESTORE_DIR/minio:/backup:ro" \
  backup-mirror mirror /backup local/privis-documents
```

### 7.4. Nyalakan dan verifikasi

```bash
docker compose start api
curl -fsS http://127.0.0.1:3000/health
curl -fsS https://privis.briczz.my.id/health
```

Login di aplikasi, buka proyek, unduh satu dokumen, dan pastikan jumlah dokumen
sesuai. Cek juga `document_count` di dashboard.

## 8. Keamanan

- Arsip berisi database + dokumen; perlakukan sebagai data rahasia.
- `chmod 600 backup.env ~/.config/rclone/rclone.conf`; batasi akses
  `BACKUP_DIR` (700).
- Bucket offsite harus privat. Aktifkan enkripsi provider atau rclone crypt.
- Jangan simpan kredensial rclone di repo atau dalam cron command line.
- Rotasi kredensial offsite secara berkala dan uji restore minimal 3 bulan
  sekali.

## 9. Troubleshooting

| Gejala | Solusi |
|---|---|
| `rclone tidak ditemukan` | Install rclone atau kosongkan `BACKUP_REMOTE` untuk backup lokal |
| `service "backup-mirror" refers to undefined volume` | `BACKUP_MIRROR_DIR` harus path absolut; jalankan lewat script |
| `mc: Unable to initialize new alias` | Pastikan `docker compose up -d` sudah membuat `minio-init` & volume `mc_config` |
| `flock` tidak tersedia | Script otomatis memakai lock folder; pastikan `BACKUP_DIR` bisa ditulis |
| Backup lan lain dilewati | Proses backup sebelumnya masih berjalan; cek `ps aux | grep backup.sh` |
| `bind: access permissions` saat `rclone authorize` di Windows | Port 53682 diblokir/reserved (Hyper-V/WSL/Docker). Jalankan `net stop winnat` sebagai Administrator, ulangi authorize, lalu `net start winnat`; atau gunakan SSH tunnel ke VPS |
| Disk penuh | Turunkan `BACKUP_RETENTION_DAYS`, pindahkan `BACKUP_DIR` ke disk lain |
| Restore DB gagal karena sesi aktif | Hentikan `api` dan gunakan `DROP DATABASE ... WITH (FORCE)` |
