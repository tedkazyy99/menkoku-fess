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

    # Gunakan profile device bawaan instagrapi yang sudah lengkap dengan Bloks hash
    cl.set_locale("id_ID")
    cl.set_country(62)

    # 1. Cek Sesi Tersimpan
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
            print("[i] Menyiapkan login baru...\n")

    print("Pilih metode login:")
    print("  1. Username & Password (Standar)")
    print("  2. Cookie 'sessionid' Browser (Rekomendasi jika kena CAA/Challenge)")
    pilihan = input("Pilihan (1/2, default: 1): ").strip() or "1"

    if pilihan == "2":
        print("\n--- CARA AMBIL SESSIONID DARI BROWSER ---")
        print("1. Buka instagram.com di Chrome (pastikan sudah login akun bot).")
        print("2. Tekan F12 -> tab 'Application' -> menu 'Cookies' -> 'https://www.instagram.com'.")
        print("3. Copy nilai (value) dari cookie bernama 'sessionid'.")
        print("------------------------------------------")
        sessionid = input("Paste cookie sessionid : ").strip()
        if not sessionid:
            print("[ERROR] sessionid tidak boleh kosong.")
            return None
        try:
            print("[i] Memverifikasi sessionid...")
            cl.login_by_sessionid(sessionid)
            cl.dump_settings(SESSION_FILE)
            user_info = cl.account_info()
            print(f"\n[SUCCESS] Login sukses sebagai: @{user_info.username} ({user_info.full_name})")
            print(f"[i] Sesi disimpan di: {SESSION_FILE}")
            return cl
        except Exception as e:
            print(f"[ERROR] Gagal login via sessionid: {e}")
            return None

    # Metode 1: Username & Password
    username = input("\nUsername Instagram : ").strip()
    password = input("Password Instagram : ").strip()
    two_factor = input("Kode 2FA Authenticator (kosongkan jika tidak ada): ").strip() or None

    try:
        print("[i] Menghubungi server Instagram...")
        cl.login(username, password, verification_code=two_factor)
        cl.dump_settings(SESSION_FILE)
        print(f"\n[SUCCESS] Login berhasil! Sesi disimpan di: {SESSION_FILE}")
        print("[TIP] worker.py sekarang bisa berjalan otomatis tanpa perlu input password lagi.")
        return cl
    except BadPassword:
        print("[ERROR] Password salah.")
    except ChallengeRequired as e:
        print(f"[ERROR] Instagram meminta verifikasi keamanan (Challenge): {e}")
        print("[TIP] Gunakan pilihan nomor 2 (Cookie sessionid) untuk bypass challenge ini.")
    except PleaseWaitFewMinutes:
        print("[ERROR] Terlalu banyak percobaan. Harap tunggu beberapa menit atau gunakan metode 2 (sessionid).")
    except Exception as e:
        print(f"[ERROR] Gagal login: {e}")
        print("[TIP] Jika tetap muncul error Bloks/CAA, gunakan metode 2 (Cookie sessionid dari browser).")

    return None

if __name__ == "__main__":
    login()
