"""
Script untuk menguji pencarian musik Instagram dan simulasi posting.
"""
from pathlib import Path
from instagrapi import Client

SESSION_FILE = Path(__file__).parent / "session.json"

def test_music_search(query: str):
    print(f"\n[Test] Mencari lagu: '{query}'...")
    if not SESSION_FILE.exists():
        print("[!] File session.json belum ada. Jalankan login.py terlebih dahulu untuk menguji API Instagram.")
        return

    cl = Client()
    cl.load_settings(SESSION_FILE)
    cl.login_by_sessionid(cl.sessionid)

    try:
        tracks = cl.search_music(query)
        print(f"[Hasil] Ditemukan {len(tracks)} lagu:")
        for i, t in enumerate(tracks[:5]):
            print(f"  {i+1}. {t.title} - {t.display_artist} (Audio ID: {t.id})")
    except Exception as e:
        print(f"[!] Error: {e}")

if __name__ == "__main__":
    import sys
    query = sys.argv[1] if len(sys.argv) > 1 else "Nadin Amizah Rayuan Perempuan Gila"
    test_music_search(query)
