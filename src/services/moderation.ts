import crypto from "crypto";
import { checkDbRateLimit } from "../db/schema.js";

// SARA, extreme toxicity, or prohibited contact vectors
const BLACKLISTED_WORDS = [
  "kontol",
  "memek",
  "jembut",
  "ngentot",
  "porno",
  "bokep",
  "open bo",
  "jual ginjal",
  "bunuh diri",
  "sange",
  "lonte",
  "perek",
  "bajingan",
  "bangsat",
];

const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000; // 5 menit per submission

let saltWarned = false;
export function getSalt(): string {
  const salt = process.env.SALT;
  if (!salt || salt === "menfess_salt") {
    if (!saltWarned && process.env.NODE_ENV !== "test" && !process.argv.some((a) => a.includes("test"))) {
      console.warn("[Security Warning] SALT belum diatur atau menggunakan default di .env! Harap set SALT unik untuk melindungi privasi pengirim.");
      saltWarned = true;
    }
    return salt || "menfess_default_salt_change_in_prod";
  }
  return salt;
}

export async function checkRateLimit(ip: string): Promise<{ allowed: boolean; waitSeconds?: number }> {
  // Hash IP with secure salt to protect user anonymity
  const ipHash = crypto
    .createHash("sha256")
    .update(ip + getSalt())
    .digest("hex");

  return await checkDbRateLimit(ipHash, RATE_LIMIT_WINDOW_MS);
}

export interface ModerationResult {
  passed: boolean;
  flagReason?: string;
  isHardReject?: boolean;
}

export async function moderateContent(content: string): Promise<ModerationResult> {
  const trimmed = content.trim();

  // 1. Minimum & Maximum Length
  if (trimmed.length < 5) {
    return { passed: false, flagReason: "Pesan terlalu pendek (minimal 5 karakter)", isHardReject: true };
  }
  if (trimmed.length > 800) {
    return { passed: false, flagReason: "Pesan terlalu panjang (maksimal 800 karakter)", isHardReject: true };
  }

  // 2. Check Phone Numbers (Doxxing / Open BO / Scam prevention)
  // Non-global regex test to prevent regex state leaks across calls
  const phonePattern = /(\+62|62|08)[0-9\- ]{8,15}/;
  if (phonePattern.test(trimmed)) {
    return {
      passed: false,
      flagReason: "Terdeteksi nomor telepon atau kontak pribadi (anti-doxxing)",
      isHardReject: false,
    };
  }

  // 3. Check External Links
  const linkPattern = /(https?:\/\/|wa\.me|t\.me|bit\.ly)/i;
  if (linkPattern.test(trimmed)) {
    return {
      passed: false,
      flagReason: "Terdeteksi tautan eksternal / link spam",
      isHardReject: false,
    };
  }

  // 4. Check Blacklisted Words
  const lowerContent = trimmed.toLowerCase();
  for (const word of BLACKLISTED_WORDS) {
    if (lowerContent.includes(word)) {
      return {
        passed: false,
        flagReason: `Terdeteksi kata sensitif / terlarang: "${word}"`,
        isHardReject: false,
      };
    }
  }

  return { passed: true };
}
