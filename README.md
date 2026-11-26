# Patroli — Sistem Patroli Keamanan Multi-Cabang

Aplikasi web PWA (mobile-first, Bahasa Indonesia) untuk patroli petugas keamanan multi-cabang, dengan bukti selfie ber-GPS dan verifikasi QR terenkripsi di setiap titik patroli.

## Fitur Utama

- **Dua role**: admin dan petugas. Akun petugas berstatus pending sampai disetujui admin.
- **Pendaftaran publik** dengan nama, NPK, email, password. Login memakai NPK atau email.
- **Patroli**: pilih shift (Pagi/Siang/Malam), daftar titik dengan progres, verifikasi QR untuk titik ber-GPS.
- **Selfie ber-GPS**: wajib diambil dari kamera depan dengan `getUserMedia`, GPS `watchPosition` (akurasi maks 50 m), stempel nama/NPK/koordinat/waktu WIB.
- **QR terenkripsi (AES-256-GCM)**: token `PTR1.` + base64url(IV + ciphertext). Mode dinamis (kedaluwarsa 60 dtk) dan statis (untuk ditempel).
- **Foto kondisi**: min 2, maks 8 (JPEG/PNG/WebP, dikompres maks 1280 px). Total min 3 foto per titik.
- **Laporan**: filter tanggal/cabang/shift/kondisi, unduh PDF & Excel, bagikan ke WhatsApp, hapus.
- **Cetak QR**: hanya titik statis ber-GPS, layout 2 kolom CSS print.
- **PWA**: installable, service worker, draf tersimpan di IndexedDB.

## Tech Stack

- Vite + React + TypeScript + Tailwind CSS, React Router
- Supabase: Auth, Postgres (RLS), Storage (bucket privat), Edge Functions
- Library: qrcode, jsPDF, exceljs, zod, date-fns-tz

## Setup

### 1. Supabase

Skema database sudah diterapkan melalui migrasi. Tabel utama:

- `branches`, `checkpoints`, `profiles`, `patrols`, `entries`, `photos`, `scans`, `audit_log`
- RLS aktif di semua tabel. Petugas hanya akses data miliknya di cabangnya; admin boleh semua.
- Fungsi `upsert_entry` (SECURITY DEFINER) memvalidasi server-side: scan sukses wajib, selfie & koordinat wajib, akurasi ≤ 50 m.
- Bucket Storage `photos` privat, akses lewat signed URL.

### 2. Secret Edge Functions

Atur secret berikut di **Supabase Dashboard → Edge Functions → Secrets**:

```
AES_KEY_HEX=<64 karakter hex, hasil: openssl rand -hex 32>
RESEND_API_KEY=<API key Resend>
FROM_EMAIL=patroli@resend.dev
```

### 3. Admin Pertama

Admin seed sudah dibuat dengan kredensial default:

- **Email**: `admin@patroli.id`
- **Password**: `Patroli2026!`

Ganti password segera setelah login pertama melalui menu Petugas → Reset Password.

### 4. Data Contoh

Migrasi sudah menyertakan:
- 2 cabang: Cabang Pusat (BA-001), Cabang Bandung (BA-002)
- 5 titik patroli (campuran dinamis & statis)

### 5. Menjalankan

```bash
npm install
npm run dev
```

Build produksi:

```bash
npm run build
```

## Edge Functions

| Function | Endpoint | Fungsi |
|---|---|---|
| `scan-qr` | `/functions/v1/scan-qr` | Verifikasi token QR: cek sesi, token valid, titik aktif, milik cabang, qr_version, TTL dinamis, akurasi ≤ 10 m, jarak haversine ≤ radius. Rate limit 20/menit. |
| `generate-qr` | `/functions/v1/generate-qr` | Hasilkan token QR terenkripsi (admin only). |
| `send-report` | `/functions/v1/send-report` | Kirim laporan patroli via email (Resend). |
| `admin-actions` | `/functions/v1/admin-actions` | Aksi admin: approve/reject/update/reset password petugas, revoke QR, finish patrol. |

## Keamanan

- RLS di semua tabel, grant minimal per peran.
- Validasi server-side di Edge Function dan `upsert_entry` (jarak, TTL, akurasi, jumlah foto, kepemilikan cabang).
- Bucket foto privat, signed URL berumur pendek, batas 6 MB.
- Kunci AES-256-GCM hanya di server (Supabase secret), tidak pernah ke klien.
- Entry mencurigakan ditandai otomatis (akurasi tidak wajar atau lokasi selfie jauh dari titik).

## Waktu

Semua waktu disimpan UTC, ditampilkan dan dihitung dalam Asia/Jakarta (WIB).

## Deploy

Aplikasi ini adalah PWA yang dapat di-deploy ke hosting statis mana pun (Vercel, Netlify, Cloudflare Pages). Build menghasilkan folder `dist/`.

```bash
npm run build
# Deploy folder dist/
```
