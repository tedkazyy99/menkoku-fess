import os
import tempfile
import requests
from pathlib import Path
from instagrapi import Client

SESSION_FILE = Path(__file__).parent / "session.json"

def get_client() -> Client:
    if not SESSION_FILE.exists():
        raise FileNotFoundError(
            f"File session {SESSION_FILE} tidak ditemukan! Jalankan 'python worker/login.py' terlebih dahulu."
        )
    
    cl = Client()
    cl.load_settings(SESSION_FILE)
    cl.login_by_sessionid(cl.sessionid)
    return cl

def download_images(image_sources: list) -> list:
    """Download list of URLs or verify local file paths."""
    local_paths = []
    temp_dir = Path(tempfile.gettempdir()) / "menfess_slides"
    temp_dir.mkdir(parents=True, exist_ok=True)

    for i, src in enumerate(image_sources):
        src_str = str(src).strip()
        if src_str.startswith("http://") or src_str.startswith("https://"):
            local_file = temp_dir / f"slide_{i}_{os.getpid()}.jpg"
            resp = requests.get(src_str, timeout=30)
            resp.raise_for_status()
            with open(local_file, "wb") as f:
                f.write(resp.content)
            local_paths.append(local_file)
        else:
            p = Path(src_str)
            if not p.exists():
                raise FileNotFoundError(f"File gambar tidak ditemukan: {src_str}")
            local_paths.append(p)

    return local_paths

def publish_menfess_with_music(
    images: list,
    caption: str,
    music_query: str = None,
) -> dict:
    """
    Publish multiple slides (carousel) or single photo with official Instagram music.
    """
    cl = get_client()
    local_paths = download_images(images)

    if not local_paths:
        raise ValueError("Daftar gambar tidak boleh kosong.")

    track = None
    if music_query:
        print(f"[Musik] Mencari lagu di katalog Instagram: '{music_query}'...")
        try:
            results = cl.search_music(music_query)
            if results:
                track = results[0]
                print(f"[Musik] Lagu ditemukan: '{track.title}' oleh '{track.display_artist}' (ID: {track.id})")
            else:
                print(f"[Musik] Tidak ditemukan lagu untuk '{music_query}', lanjut tanpa musik.")
        except Exception as e:
            print(f"[!] Gagal mencari musik: {e}, lanjut tanpa musik.")

    is_multiple = len(local_paths) > 1

    print(f"[Publish] Mengunggah {len(local_paths)} slide ke feed Instagram...")
    if is_multiple:
        if track:
            media = cl.album_upload_with_music(
                paths=local_paths,
                caption=caption,
                track=track,
            )
        else:
            media = cl.album_upload(
                paths=local_paths,
                caption=caption,
            )
    else:
        if track:
            media = cl.photo_upload_with_music(
                path=local_paths[0],
                caption=caption,
                track=track,
            )
        else:
            media = cl.photo_upload(
                path=local_paths[0],
                caption=caption,
            )

    post_url = f"https://www.instagram.com/p/{media.code}/"
    print(f"[SUCCESS] Berhasil diposting! Link: {post_url}")

    return {
        "success": True,
        "media_id": str(media.id),
        "code": media.code,
        "url": post_url,
        "track_name": f"{track.title} - {track.display_artist}" if track else None,
    }
