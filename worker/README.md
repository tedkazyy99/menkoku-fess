# Layer Publisher (Python Worker + Instagrapi)

Worker lokal untuk mengunggah Menfess ke Instagram Feed Carousel dengan stiker musik resmi Instagram via `instagrapi`.

---

## 1. Persiapan Lingkungan

Virtual environment dan dependencies sudah terpasang di `worker/venv`.

Jika ingin install ulang di tempat lain:
```bash
python -m venv worker/venv
.\worker\venv\Scripts\pip install -r worker/requirements.txt
```

---

## 2. Generate Sesi (Login Sekali Saja)

Jalankan script login untuk menyimpan `session.json` dan device fingerprint (Galaxy S22):

```powershell
.\worker\venv\Scripts\python worker/login.py
```

* Masukkan Username & Password Instagram akun menfess kamu.
* Masukkan kode 2FA / OTP jika diminta.
* Setelah sukses, file `session.json` akan dibuat. Password tidak disimpan, hanya session cookie.

---

## 3. Uji Coba Pencarian Musik

Cek apakah API Instagram bisa menemukan lagu di katalog resmi:

```powershell
.\worker\venv\Scripts\python worker/test_mock.py "Nadin Amizah Rayuan Perempuan Gila"
```

---

## 4. Menjalankan Worker Antrean

Untuk memproses menfess yang masuk dari web secara otomatis:

```powershell
.\worker\venv\Scripts\python worker/worker.py
```

Worker akan:
1. Membaca database Turso untuk pesan berstatus `queued`.
2. Mencari lagu yang diminta pengirim.
3. Mengunggah carousel (beberapa slide) + musik ke Instagram.
4. Memberi jeda acak 45–90 detik antar postingan agar terhindar dari spam filter.
