# Platform Menfess Auto-Post Instagram

Platform web pengirim menfess anonim dengan fitur auto-post ke Instagram Feed, generator kartu gambar otomatis via `@vercel/og`, filter moderasi otomatis, dan dashboard admin moderator.

## Fitur Utama

- **100% Auto-Post**: Pesan yang lolos moderasi langsung dicetak jadi gambar 1080x1080 dan diposting ke Instagram.
- **Safety Net Karantina**: Pesan yang melanggar (nomor telepon/doxxing, kata kasar, link spam, atau jika kuota IG 25/hari penuh) ditahan di status `flagged`.
- **Dashboard Admin**:
  - Pantau feed & sisa kuota harian postingan Meta (25 post / 24 jam).
  - Tinjau dan setujui (Approve) pesan dari karantina.
  - Takedown postingan langsung dari feed Instagram (Graph API delete).
- **Generator Gambar Cepat**: Berbasis `@vercel/og` (Satori), tanpa Chromium/Puppeteer yang berat.
- **Serverless & Edge Ready**: Siap deploy di Vercel gratis dengan database Turso / LibSQL.

---

## Menjalankan di Lokal (Development)

1. Pastikan dependensi sudah terpasang:
   ```bash
   npm install
   ```
2. Jalankan server lokal:
   ```bash
   npm run dev
   ```
3. Buka di browser:
   - Form User: [http://localhost:3000](http://localhost:3000)
   - Dashboard Admin: [http://localhost:3000/admin](http://localhost:3000/admin) (Password default: `supersecretadminpassword123`)

---

## Konfigurasi Environment (`.env`)

Salin `.env.example` ke `.env`:

```env
# Database (default ke SQLite lokal untuk dev, atau isi kredensial Turso untuk production)
TURSO_DATABASE_URL="file:local.db"
TURSO_AUTH_TOKEN=""

# Cloudinary (untuk host gambar publik yang dibutuhkan Instagram Graph API)
CLOUDINARY_CLOUD_NAME=""
CLOUDINARY_API_KEY=""
CLOUDINARY_API_SECRET=""

# Instagram Meta Graph API
INSTAGRAM_ACCOUNT_ID=""
META_ACCESS_TOKEN=""

# Password Dashboard Admin
ADMIN_PASSWORD="ganti_dengan_password_kamu"
```

*Catatan: Saat kredensial Meta atau Cloudinary belum diisi, sistem berjalan dalam mode mock/simulasi sehingga bisa diuji coba tanpa error.*

---

## Deploy ke Vercel

1. Push folder ini ke repository GitHub.
2. Impor proyek di dashboard [Vercel](https://vercel.com).
3. Masukkan Environment Variables di Vercel:
   - `TURSO_DATABASE_URL` (dari turso.tech)
   - `TURSO_AUTH_TOKEN`
   - `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`
   - `INSTAGRAM_ACCOUNT_ID`, `META_ACCESS_TOKEN`
   - `ADMIN_PASSWORD`
4. Deploy!

