import os
import time
import json
import random
from pathlib import Path
from dotenv import load_dotenv
import requests

from poster import publish_menfess_with_music

# Load .env dari root project jika ada
ROOT_DIR = Path(__file__).parent.parent
load_dotenv(ROOT_DIR / ".env")
load_dotenv(Path(__file__).parent / ".env")

TURSO_URL = os.getenv("TURSO_DATABASE_URL", "").replace("libsql://", "https://")
TURSO_TOKEN = os.getenv("TURSO_AUTH_TOKEN", "")

def execute_turso_sql(sql: str, args: list = None) -> list:
    """Eksekusi query SQL ke Turso via HTTP Pipeline (Nol dependencies C++)."""
    if not TURSO_URL or not TURSO_TOKEN:
        return []

    pipeline_url = f"{TURSO_URL}/v2/pipeline"
    headers = {
        "Authorization": f"Bearer {TURSO_TOKEN}",
        "Content-Type": "application/json",
    }
    
    formatted_args = []
    for arg in (args or []):
        if arg is None:
            formatted_args.append({"type": "null"})
        elif isinstance(arg, int):
            formatted_args.append({"type": "integer", "value": str(arg)})
        elif isinstance(arg, float):
            formatted_args.append({"type": "float", "value": arg})
        else:
            formatted_args.append({"type": "text", "value": str(arg)})

    payload = {
        "requests": [
            {
                "type": "execute",
                "stmt": {
                    "sql": sql,
                    "args": formatted_args,
                },
            },
            {"type": "close"},
        ]
    }

    try:
        resp = requests.post(pipeline_url, headers=headers, json=payload, timeout=10)
        resp.raise_for_status()
        data = resp.json()
        results = data.get("results", [])
        if results and "response" in results[0]:
            result_obj = results[0]["response"].get("result", {})
            rows = result_obj.get("rows", [])
            cols = [c["name"] for c in result_obj.get("cols", [])]
            parsed_rows = []
            for r in rows:
                row_dict = {}
                for idx, col in enumerate(cols):
                    val = r[idx].get("value")
                    row_dict[col] = val
                parsed_rows.append(row_dict)
            return parsed_rows
    except Exception as e:
        print(f"[Turso Error] {e}")
    return []

def run_worker():
    print("=" * 60)
    print("  MENFESSKAN - PYTHON QUEUE PUBLISHER WORKER")
    print("=" * 60)
    print("[i] Worker aktif. Menunggu pesan berstatus 'queued'...")

    while True:
        try:
            # 1. Ambil pesan antrean terlama
            rows = execute_turso_sql(
                "SELECT * FROM menfess WHERE status = 'queued' ORDER BY created_at ASC LIMIT 1"
            )

            if rows:
                item = rows[0]
                item_id = item["id"]
                content = item.get("content", "")
                image_url = item.get("image_url")
                song_query = item.get("song_query")
                slides_json = item.get("slides_json")
                flag_reason = item.get("flag_reason")

                print(f"\n[+] Memproses antrean menfess ID: {item_id}")
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
                    f"[Menfesskan #{item_id[:8]}]\n\n"
                    f"\"{content}\"\n\n"
                    f"{music_line}"
                    f"---\n"
                    f"Kirim menfess anonim via link di bio!\n"
                    f"#menfesskan #menfess #songfess #tembayo"
                )

                # 2. Posting ke Instagram via instagrapi
                res = publish_menfess_with_music(
                    images=images,
                    caption=caption,
                    music_query=music_query,
                )

                # 3. Update status di DB menjadi 'posted'
                now = int(time.time() * 1000)
                execute_turso_sql(
                    "UPDATE menfess SET status = 'posted', ig_media_id = ?, ig_permalink = ?, posted_at = ? WHERE id = ?",
                    [res["media_id"], res["url"], now, item_id],
                )
                print(f"[OK] Sukses update status ID {item_id} -> posted.")

                # 4. Human Delay: Istirahat acak 45 - 90 detik antar postingan
                sleep_time = random.randint(45, 90)
                print(f"[Cooldown] Istirahat {sleep_time} detik untuk mensimulasikan jeda manusia...")
                time.sleep(sleep_time)

            else:
                # Jika antrean kosong, polling setiap 10 detik
                time.sleep(10)

        except KeyboardInterrupt:
            print("\n[i] Worker dihentikan oleh user.")
            break
        except Exception as e:
            print(f"[Worker Error] {e}")
            time.sleep(15)

if __name__ == "__main__":
    run_worker()

