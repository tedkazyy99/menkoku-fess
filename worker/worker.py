import os
import time
import json
import random
from pathlib import Path
from dotenv import load_dotenv
import psycopg
from psycopg.rows import dict_row

from poster import publish_menfess_with_music

# Load .env dari root project jika ada
ROOT_DIR = Path(__file__).parent.parent
load_dotenv(ROOT_DIR / ".env")
load_dotenv(Path(__file__).parent / ".env")

DATABASE_URL = os.getenv("DATABASE_URL", "")

if not DATABASE_URL:
    raise RuntimeError("[Config Error] DATABASE_URL tidak ditemukan di .env!")

def claim_next_job():
    """
    Klaim job tertua secara atomik menggunakan FOR UPDATE SKIP LOCKED.
    Menjamin tidak ada race condition dan tidak ada duplicate posting antar worker.
    """
    with psycopg.connect(DATABASE_URL, row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute("""
                UPDATE menfess
                SET status = 'processing'
                WHERE id = (
                    SELECT id FROM menfess
                    WHERE status = 'queued'
                    ORDER BY created_at ASC
                    LIMIT 1
                    FOR UPDATE SKIP LOCKED
                )
                RETURNING id, content, image_url, song_query, slides_json, flag_reason;
            """)
            job = cur.fetchone()
            conn.commit()
            return job

def mark_job_posted(item_id: str, media_id: str, permalink: str):
    """Update status job menjadi 'posted'."""
    now = int(time.time() * 1000)
    with psycopg.connect(DATABASE_URL) as conn:
        with conn.cursor() as cur:
            cur.execute("""
                UPDATE menfess
                SET status = 'posted', ig_media_id = %s, ig_permalink = %s, posted_at = %s
                WHERE id = %s
            """, (media_id, permalink, now, item_id))
            conn.commit()

def mark_job_failed(item_id: str, error_msg: str):
    """Tandai status job sebagai 'failed' untuk mencegah looping tanpa henti."""
    with psycopg.connect(DATABASE_URL) as conn:
        with conn.cursor() as cur:
            cur.execute("""
                UPDATE menfess
                SET status = 'failed', flag_reason = %s
                WHERE id = %s
            """, (error_msg[:250], item_id))
            conn.commit()

def run_worker():
    safe_db_info = DATABASE_URL.split("@")[-1] if "@" in DATABASE_URL else "configured"
    print("=" * 60)
    print("  MENFESSKAN - PYTHON QUEUE PUBLISHER WORKER (POSTGRESQL)")
    print("=" * 60)
    print(f"[i] Worker aktif. Terhubung ke PostgreSQL: {safe_db_info}")
    print("[i] Menunggu pesan berstatus 'queued'...")

    while True:
        try:
            item = claim_next_job()

            if not item:
                # Antrean kosong, polling setiap 10 detik
                time.sleep(10)
                continue

            item_id = item["id"]
            content = item.get("content", "")
            image_url = item.get("image_url")
            song_query = item.get("song_query")
            slides_json = item.get("slides_json")
            flag_reason = item.get("flag_reason")

            print(f"\n[+] Mengunci atomik & memproses antrean menfess ID: {item_id}")
            print(f"    Konten : \"{content[:60]}...\"")

            # Parse daftar gambar slide
            images = []
            if slides_json:
                try:
                    parsed = json.loads(slides_json)
                    if isinstance(parsed, list):
                        images = [str(u) for u in parsed if u]
                except Exception as e:
                    print(f"[!] Gagal parse slides_json: {e}")

            if not images and image_url:
                images = [image_url]

            # Tentukan musik yang diminta
            music_query = (song_query or "").strip() or None
            if not music_query and flag_reason and flag_reason.startswith("MUSIC:"):
                music_query = flag_reason.replace("MUSIC:", "").strip()

            print(f"    Total Slide: {len(images)}")
            if music_query:
                print(f"    Request Lagu: {music_query}")

            # Buat caption
            music_line = f"🎵 Lagu: {music_query}\n" if music_query else ""
            caption = (
                f"[Stembayo Menfess #{item_id[:8]}]\n\n"
                f"\"{content}\"\n\n"
                f"{music_line}"
                f"---\n"
                f"Kirim menfess anonim via link di bio!\n"
                f"#stembayomenfess #menfess #songfess #tembayo"
            )

            try:
                # Posting ke Instagram via instagrapi
                res = publish_menfess_with_music(
                    images=images,
                    caption=caption,
                    music_query=music_query,
                )

                mark_job_posted(item_id, res["media_id"], res["url"])
                print(f"[OK] Sukses posting & update status ID {item_id} -> posted.")

                # Human Delay: Istirahat acak 45 - 90 detik antar postingan
                sleep_time = random.randint(45, 90)
                print(f"[Cooldown] Istirahat {sleep_time} detik untuk mensimulasikan jeda manusia...")
                time.sleep(sleep_time)

            except Exception as post_err:
                err_msg = str(post_err)[:250]
                print(f"[!] Gagal posting Instagram ID {item_id}: {err_msg}")
                mark_job_failed(item_id, f"Gagal posting: {err_msg}")

        except KeyboardInterrupt:
            print("\n[i] Worker dihentikan oleh user.")
            break
        except Exception as e:
            print(f"[Worker Error] {e}")
            time.sleep(10)

if __name__ == "__main__":
    run_worker()
