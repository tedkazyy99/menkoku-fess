import os
import sys
import json
from pathlib import Path
from instagrapi import Client
from instagrapi.exceptions import (
    BadPassword,
    ReloginAttemptExceeded,
    ChallengeRequired,
    SelectContactPointRecoveryForm,
    RecaptchaChallengeForm,
    FeedbackRequired,
    PleaseWaitFewMinutes,
)

SESSION_FILE = Path(__file__).parent / "session.json"

def challenge_code_handler(username, choice):
    if choice is SelectContactPointRecoveryForm:
        return None
    return input(f"[2FA / Challenge] Masukkan kode verifikasi SMS/Email untuk {username}: ").strip()

def login():
    print("=" * 60)
    print("  MENFESSKAN - INSTAGRAM LOCAL SESSION GENERATOR")
    print("=" * 60)

    cl = Client()
    cl.challenge_code_handler = challenge_code_handler

    # Emulasikan device Android konsisten (Samsung Galaxy S22)
    cl.set_device({
        "app_version": "269.0.0.18.75",
        "android_version": 31,
        "android_release": "12.0",
        "dpi": "480dpi",
        "resolution": "1080x2340",
        "manufacturer": "Samsung",
        "device": "SM-S901B",
        "model": "Galaxy S22",
        "cpu": "exynos2200",
        "version_code": "314665256",
    })

    if SESSION_FILE.exists():
        print(f"[i] Ditemukan file sesi: {SESSION_FILE}")
        try:
            cl.load_settings(SESSION_FILE)
            cl.login_by_sessionid(cl.sessionid)
            user_info = cl.account_info()
            print(f"[OK] Sesi masih aktif! Login sebagai: @{user_info.username} ({user_info.full_name})")
            return cl
        except Exception as e:
            print(f"[!] Sesi lama kadaluarsa atau tidak valid: {e}")
            print("[i] Mencoba login ulang...")

    username = input("Username Instagram : ").strip()
    password = input("Password Instagram : ").strip()
    two_factor = input("Kode 2FA Authenticator (kosongkan jika tidak ada): ").strip() or None

    try:
        print("[i] Menghubungi server Instagram...")
        cl.login(username, password, verification_code=two_factor)
        cl.dump_settings(SESSION_FILE)
        print(f"[SUCCESS] Login berhasil! Sesi disimpan di: {SESSION_FILE}")
        print("[TIP] worker.py sekarang bisa berjalan otomatis tanpa perlu input password lagi.")
        return cl
    except BadPassword:
        print("[ERROR] Password salah.")
    except ChallengeRequired as e:
        print(f"[ERROR] Instagram meminta verifikasi keamanan (Challenge): {e}")
    except PleaseWaitFewMinutes:
        print("[ERROR] Terlalu banyak percobaan. Harap tunggu beberapa menit sebelum mencoba lagi.")
    except Exception as e:
        print(f"[ERROR] Gagal login: {e}")

    return None

if __name__ == "__main__":
    login()
