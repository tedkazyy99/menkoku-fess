import { Hono } from "hono";
import { cors } from "hono/cors";
import crypto from "crypto";
import {
  initDb,
  insertMenfess,
  getMenfessList,
  getMenfessById,
  updateMenfessStatus,
  getTodayPostedCount,
  type MenfessRecord,
} from "./db/schema.js";
import { moderateContent, checkRateLimit } from "./services/moderation.js";
import { generateMenfessImage } from "./services/image.js";
import { uploadImageToCloud } from "./services/storage.js";
import { publishToInstagram, deleteFromInstagram } from "./services/instagram.js";
import { formHtml, adminHtml, pageCss, adminCss } from "./views/templates.js";

export const app = new Hono();

app.use("*", cors());

// Global error handler: Prevents unhandled serverless 500 crashes
app.onError((err, c) => {
  console.error("[Server Error]", err);
  return c.json(
    {
      error: "Internal Server Error",
      message: err.message,
    },
    500
  );
});

// Lazy DB initialization to prevent cold-start crashes
let dbReady = false;
async function ensureDb() {
  if (!dbReady) {
    await initDb();
    dbReady = true;
  }
}

// Helper to securely extract client IP from trusted proxy headers
function getClientIp(c: any): string {
  const vercelIp = c.req.header("x-vercel-forwarded-for");
  if (vercelIp) return vercelIp.split(",")[0].trim();

  const cfIp = c.req.header("cf-connecting-ip");
  if (cfIp) return cfIp.trim();

  const realIp = c.req.header("x-real-ip");
  if (realIp) return realIp.trim();

  const forwarded = c.req.header("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();

  return "127.0.0.1";
}

// 1. User Web Form
app.get("/", (c) => {
  ensureDb().catch((e) => console.error("[DB Lazy Init]", e));
  return c.html(formHtml);
});

// 2. Admin Dashboard Web View
app.get("/admin", (c) => {
  ensureDb().catch((e) => console.error("[DB Lazy Init]", e));
  return c.html(adminHtml);
});

// Serve self-contained CSS styles directly from memory (0 filesystem dependency)
app.get("/styles/page.css", (c) => {
  return c.text(pageCss, 200, { "Content-Type": "text/css" });
});

app.get("/styles/admin.css", (c) => {
  return c.text(adminCss, 200, { "Content-Type": "text/css" });
});

// 3. User Submit Menfess
app.post("/api/menfess", async (c) => {
  await ensureDb();

  const ip = getClientIp(c);

  // Check Persistent Database Rate Limit
  const rateLimit = await checkRateLimit(ip);
  if (!rateLimit.allowed) {
    return c.json(
      {
        success: false,
        error: `Terlalu cepat. Harap tunggu ${rateLimit.waitSeconds} detik sebelum kirim lagi.`,
      },
      429
    );
  }

  const body = await c.req.json().catch(() => ({}));
  const content = String(body.content || "").trim();

  // Moderation check
  const modResult = await moderateContent(content);
  if (modResult.isHardReject) {
    return c.json({ success: false, error: modResult.flagReason }, 400);
  }

  const id = crypto.randomUUID();
  const now = Date.now();

  // Always save initial record in database first (prevents lost post states)
  const initialRecord: MenfessRecord = {
    id,
    content,
    status: modResult.passed ? "pending" : "flagged",
    image_url: null,
    ig_media_id: null,
    ig_permalink: null,
    flag_reason: modResult.passed ? null : modResult.flagReason || "Terindikasi perlu tinjauan",
    created_at: now,
    posted_at: null,
  };
  await insertMenfess(initialRecord);

  // If content was flagged by moderation rules
  if (!modResult.passed) {
    return c.json({
      success: true,
      status: "flagged",
      flagReason: modResult.flagReason,
      message: "Menfess masuk antrean karantina admin.",
    });
  }

  // Auto-post to Instagram
  try {
    const imageBuffer = await generateMenfessImage({ content, id });
    const uploadRes = await uploadImageToCloud(imageBuffer, `menfess_${id}`);

    const caption = `[Menfesskan #${id.slice(0, 8)}]\n\n"${content}"\n\n---\nKirim pesan anonim via link di bio!\n#menfesskan #menfess`;
    const igRes = await publishToInstagram({
      imageUrl: uploadRes.url,
      caption,
    });

    await updateMenfessStatus(id, "posted", {
      image_url: uploadRes.url,
      ig_media_id: igRes.mediaId,
      ig_permalink: igRes.permalink,
      posted_at: Date.now(),
    });

    return c.json({
      success: true,
      status: "posted",
      permalink: igRes.permalink,
    });
  } catch (err: any) {
    console.error("[Post Error]", err);
    await updateMenfessStatus(id, "flagged", {
      flag_reason: `Gagal auto-post ke IG: ${err.message}`,
    });

    return c.json({
      success: true,
      status: "flagged",
      flagReason: `Gagal auto-post ke IG (${err.message}). Tersimpan di antrean admin.`,
    });
  }
});

// Middleware: Timing-safe Admin Authentication
function verifyAdmin(c: any): boolean {
  const authHeader = c.req.header("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  const validPassword = process.env.ADMIN_PASSWORD;

  if (!validPassword || !token) {
    return false;
  }

  const tokenHash = crypto.createHash("sha256").update(token).digest();
  const expectedHash = crypto.createHash("sha256").update(validPassword).digest();

  return crypto.timingSafeEqual(tokenHash, expectedHash);
}

// 4. Admin: Get List & Quota
app.get("/api/admin/menfess", async (c) => {
  await ensureDb();

  if (!verifyAdmin(c)) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const status = c.req.query("status") || undefined;
  const records = await getMenfessList(50, status);
  const quotaToday = await getTodayPostedCount();

  return c.json({ records, quotaToday });
});

// 5. Admin: Approve & Post flagged menfess
app.post("/api/admin/menfess/:id/approve", async (c) => {
  await ensureDb();

  if (!verifyAdmin(c)) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const id = c.req.param("id");
  const record = await getMenfessById(id);
  if (!record) {
    return c.json({ error: "Menfess tidak ditemukan" }, 404);
  }

  try {
    let imageUrl = record.image_url;
    if (!imageUrl) {
      const buffer = await generateMenfessImage({ content: record.content, id });
      const upload = await uploadImageToCloud(buffer, `menfess_${id}`);
      imageUrl = upload.url;
    }

    const caption = `[Menfesskan #${id.slice(0, 8)}]\n\n"${record.content}"\n\n---\nKirim pesan anonim via link di bio!\n#menfesskan #menfess`;
    const igRes = await publishToInstagram({ imageUrl, caption });

    await updateMenfessStatus(id, "posted", {
      image_url: imageUrl,
      ig_media_id: igRes.mediaId,
      ig_permalink: igRes.permalink,
      posted_at: Date.now(),
    });

    return c.json({ success: true, permalink: igRes.permalink });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

// 6. Admin: Reject menfess
app.post("/api/admin/menfess/:id/reject", async (c) => {
  await ensureDb();

  if (!verifyAdmin(c)) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const id = c.req.param("id");
  await updateMenfessStatus(id, "rejected");
  return c.json({ success: true });
});

// 7. Admin: Takedown from Instagram
app.post("/api/admin/menfess/:id/takedown", async (c) => {
  await ensureDb();

  if (!verifyAdmin(c)) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const id = c.req.param("id");
  const record = await getMenfessById(id);
  if (!record) {
    return c.json({ error: "Menfess tidak ditemukan" }, 404);
  }

  try {
    if (record.ig_media_id) {
      await deleteFromInstagram(record.ig_media_id);
    }
    await updateMenfessStatus(id, "deleted");
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

// 8. Public Preview Render Endpoint
app.get("/api/render-preview", async (c) => {
  const text = c.req.query("text") || "Ini adalah contoh preview tampilan menfess.";
  const buf = await generateMenfessImage({ content: text, id: "preview-123" });
  c.header("Content-Type", "image/png");
  return c.body(buf as any);
});
