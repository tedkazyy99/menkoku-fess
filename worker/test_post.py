import os
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
from instagrapi import Client

SESSION_FILE = Path(__file__).parent / "session.json"
OUTPUT_IMAGE = Path(__file__).parent / "test_card.jpg"

def generate_sample_card(output_path: Path, text: str, song_title: str) -> Path:
    """Generate kartu gambar 1080x1080 estetik bergaya Menfesskan."""
    width, height = 1080, 1080
    img = Image.new("RGB", (width, height), color=(14, 15, 23))
    draw = ImageDraw.Draw(img)

    # 1. Border & Header Box
    draw.rectangle([(50, 50), (1030, 1030)], outline=(40, 42, 60), width=3)
    draw.rectangle([(70, 70), (1010, 180)], fill=(22, 24, 38))

    # Badge
    draw.rectangle([(90, 95), (280, 155)], fill=(99, 102, 241))
    draw.text((115, 112), "MENFESSKAN", fill=(255, 255, 255))
    draw.text((310, 112), "#TEST01 • Songfess", fill=(160, 165, 190))
    draw.text((850, 112), "17 Nov 2026", fill=(120, 125, 150))

    # 2. Body Text (Curhatan)
    # Split teks ke beberapa baris sederhana
    words = text.split()
    lines = []
    curr = []
    for w in words:
        curr.append(w)
        if len(" ".join(curr)) > 32:
            lines.append(" ".join(curr[:-1]))
            curr = [w]
    if curr:
        lines.append(" ".join(curr))

    y_text = 400
    for line in lines:
        draw.text((100, y_text), f"“{line}”" if line == lines[0] else line, fill=(240, 240, 245))
        y_text += 70

    # 3. Kotak Musik di Bawah
    draw.rectangle([(80, 800), (1000, 910)], fill=(25, 27, 44), outline=(99, 102, 241), width=2)
    draw.text((110, 835), f"🎵 {song_title}", fill=(200, 210, 255))
    draw.text((110, 870), "Instagram Music Audio Track Attached", fill=(120, 130, 160))

    # 4. Footer
    draw.text((100, 970), "@fesstembayo", fill=(99, 102, 241))
    draw.text((650, 970), "Kirim via link di bio", fill=(120, 125, 150))

    img.save(output_path, "JPEG", quality=95)
    print(f"[i] Kartu sampel berhasil dibuat: {output_path}")
    return output_path

def post_test_feed():
    print("=" * 60)
    print("  MENFESSKAN - UJI POSTING INSTAGRAM FEED DENGAN MUSIK")
    print("=" * 60)

    if not SESSION_FILE.exists():
        print(f"[ERROR] Session file {SESSION_FILE} tidak ditemukan. Jalankan login.py dahulu.")
        return

    cl = Client()
    print("[1/4] Memuat sesi Instagram...")
    cl.load_settings(SESSION_FILE)
    cl.login_by_sessionid(cl.sessionid)
    user = cl.account_info()
    print(f"[OK] Terhubung sebagai: @{user.username}")

    # 1. Cari Lagu di Instagram
    song_query = "Nadin Amizah Rayuan Perempuan Gila"
    print(f"\n[2/4] Mencari lagu resmi di katalog Instagram: '{song_query}'...")
    tracks = cl.search_music(song_query)
    if not tracks:
        print("[!] Lagu tidak ditemukan di Instagram.")
        return

    track = tracks[0]
    song_name = f"{track.title} - {track.display_artist}"
    print(f"[OK] Memilih lagu: '{song_name}' (ID: {track.id})")

    # 2. Buat Gambar Kartu
    text_curhat = "Memang ga salah ya lagunya Nadin Amizah, relate banget sama kamu yang sekarang..."
    print("\n[3/4] Men-generate kartu gambar menfess 1080x1080...")
    card_path = generate_sample_card(OUTPUT_IMAGE, text_curhat, song_name)

    # 3. Caption
    caption = (
        f"[Menfesskan #TEST01]\n\n"
        f"\"{text_curhat}\"\n\n"
        f"🎵 Lagu: {song_name}\n"
        f"---\n"
        f"Kirim menfess anonim via link di bio!\n"
        f"#menfesskan #menfess #songfess #tembayo"
    )

    # 4. Upload Feed dengan Lagu
    print("\n[4/4] Mengunggah ke Feed Instagram @fesstembayo dengan audio stiker musik...")
    try:
        media = cl.photo_upload_with_music(
            path=card_path,
            caption=caption,
            track=track,
        )
        post_url = f"https://www.instagram.com/p/{media.code}/"
        print("\n" + "=" * 60)
        print(" [BERHASIL DIPOSTING KE INSTAGRAM!]")
        print(f" URL Postingan : {post_url}")
        print(f" Media ID      : {media.id}")
        print(f" Lagu Terpasang: {song_name}")
        print("=" * 60)
        print("\nSilakan buka link di atas atau cek langsung di aplikasi Instagram HP kamu!")
    except Exception as e:
        print(f"\n[ERROR] Gagal posting: {e}")

if __name__ == "__main__":
    post_test_feed()

