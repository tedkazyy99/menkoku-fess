import dotenv from "dotenv";
dotenv.config();

import { Hono } from "hono";
import { cors } from "hono/cors";
import crypto from "crypto";
import { getRequestListener } from "@hono/node-server";
import {
  initDb,
  insertMenfess,
  getMenfessList,
  getMenfessById,
  updateMenfessStatus,
  getTodayPostedCount,
  type MenfessRecord,
} from "./db/schema.js";
import { moderateContent, checkRateLimit, type ModerationResult } from "./services/moderation.js";
import { generateMenfessImage, generateMenfessPhotoImage } from "./services/image.js";
import { uploadImageToCloud } from "./services/storage.js";
import { publishToInstagram, deleteFromInstagram } from "./services/instagram.js";
import { searchMusic } from "./services/music.js";
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

// Music Autocomplete Search (iTunes API with in-memory caching)
app.get("/api/music/search", async (c) => {
  const q = String(c.req.query("q") || "").trim();
  if (!q || q.length < 2) {
    return c.json({ success: true, data: [] });
  }
  if (q.length > 80) {
    return c.json({ success: false, error: "Pencarian terlalu panjang." }, 400);
  }

  try {
    const results = await searchMusic(q);
    return c.json({ success: true, data: results });
  } catch (err: any) {
    console.error("[Music API Error]", err);
    return c.json({ success: false, error: "Gagal mencari musik.", data: [] }, 500);
  }
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

  // Parse Body (Supports both multipart/form-data and JSON)
  const contentType = c.req.header("content-type") || "";
  let content = "";
  let songQuery = "";
  let slidesMetaRaw = "";
  const uploadedFiles: File[] = [];

  if (
    contentType.includes("multipart/form-data") ||
    contentType.includes("application/x-www-form-urlencoded")
  ) {
    const body = await c.req.parseBody({ all: true });
    content = String(body.content || "").trim();
    songQuery = String(body.song_query || "").trim();
    slidesMetaRaw = String(body.slides_meta || "").trim();
    const rawImages = body["images"];
    if (Array.isArray(rawImages)) {
      rawImages.forEach((img: any) => {
        if (img instanceof File) uploadedFiles.push(img);
      });
    } else if (rawImages instanceof File) {
      uploadedFiles.push(rawImages);
    }
  } else {
    const body = await c.req.json().catch(() => ({}));
    content = String(body.content || "").trim();
    songQuery = String(body.song_query || "").trim();
    slidesMetaRaw = String(body.slides_meta || "").trim();
  }

  // --- Dynamic Multi-Slide Processing ---
  interface SlideMetaItem {
    type: "text" | "image";
    content?: string;
    fileIndex?: number;
  }

  let parsedSlides: SlideMetaItem[] | null = null;
  if (slidesMetaRaw) {
    try {
      parsedSlides = JSON.parse(slidesMetaRaw);
    } catch {
      return c.json({ success: false, error: "Format metadata slide tidak valid." }, 400);
    }
  }

  if (parsedSlides && Array.isArray(parsedSlides)) {
    if (parsedSlides.length < 1 || parsedSlides.length > 5) {
      return c.json({ success: false, error: "Jumlah slide harus antara 1 sampai 5." }, 400);
    }

    const allTextList: string[] = [];
    let imageCount = 0;

    for (let i = 0; i < parsedSlides.length; i++) {
      const s = parsedSlides[i];
      if (s.type === "text") {
        const textVal = String(s.content || "").trim();
        if (!textVal) {
          return c.json({ success: false, error: `Slide ${i + 1} (teks) tidak boleh kosong.` }, 400);
        }
        if (textVal.length > 800) {
          return c.json({ success: false, error: `Slide ${i + 1} melebihi batas 800 karakter.` }, 400);
        }
        allTextList.push(textVal);
      } else if (s.type === "image") {
        imageCount++;
      } else {
        return c.json({ success: false, error: `Tipe slide ${i + 1} tidak valid.` }, 400);
      }
    }

    if (imageCount > uploadedFiles.length) {
      return c.json({ success: false, error: "File foto pada slide belum lengkap." }, 400);
    }

    const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB
    const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
    for (const file of uploadedFiles) {
      if (file.size > MAX_FILE_SIZE) {
        return c.json(
          { success: false, error: `Foto "${file.name}" melebihi batas 2MB.` },
          400
        );
      }
      if (!ALLOWED_TYPES.includes(file.type)) {
        return c.json(
          {
            success: false,
            error: `Format foto "${file.name}" tidak didukung. Gunakan JPG, PNG, atau WebP.`,
          },
          400
        );
      }
    }

    const fullTextToModerate = allTextList.join(" \n ");
    let modResult: ModerationResult = { passed: true, isHardReject: false, flagReason: undefined };
    if (fullTextToModerate) {
      modResult = await moderateContent(fullTextToModerate);
      if (modResult.isHardReject) {
        return c.json({ success: false, error: modResult.flagReason }, 400);
      }
    }

    const id = crypto.randomUUID();
    const now = Date.now();
    const primaryContent = allTextList[0] || (uploadedFiles.length > 0 ? "[Foto Menfess]" : content || "Menfess");

    const initialRecord: MenfessRecord = {
      id,
      content: primaryContent,
      status: modResult.passed ? "pending" : "flagged",
      image_url: null,
      ig_media_id: null,
      ig_permalink: null,
      flag_reason: modResult.passed
        ? null
        : modResult.flagReason || "Terindikasi perlu tinjauan",
      song_query: songQuery || null,
      slides_json: null,
      created_at: now,
      posted_at: null,
    };
    await insertMenfess(initialRecord);

    try {
      const slidePromises = parsedSlides.map(async (slide, idx) => {
        if (slide.type === "text") {
          const textBuf = await generateMenfessImage({
            content: slide.content || "",
            id,
          });
          const res = await uploadImageToCloud(textBuf, `menfess_${id}_slide_${idx + 1}`);
          return res.url;
        } else {
          const file = uploadedFiles[slide.fileIndex ?? 0];
          if (!file) {
            throw new Error(`File foto slide ${idx + 1} tidak ditemukan.`);
          }
          const arrayBuf = await file.arrayBuffer();
          const photoBuf = Buffer.from(arrayBuf);
          const framedPhotoBuf = await generateMenfessPhotoImage({
            photoBuffer: photoBuf,
            photoMime: file.type || "image/jpeg",
            id,
          });
          const res = await uploadImageToCloud(framedPhotoBuf, `menfess_${id}_slide_${idx + 1}`);
          return res.url;
        }
      });

      const allSlideUrls = await Promise.all(slidePromises);
      const slidesJson = JSON.stringify(allSlideUrls);

      if (!modResult.passed) {
        await updateMenfessStatus(id, "flagged", {
          image_url: allSlideUrls[0],
          slides_json: slidesJson,
          song_query: songQuery,
        });

        return c.json({
          success: true,
          id,
          status: "flagged",
          flagReason: modResult.flagReason,
          message: "Menfess masuk antrean karantina admin.",
        });
      }

      const hasMetaApi = Boolean(process.env.INSTAGRAM_ACCOUNT_ID && process.env.META_ACCESS_TOKEN);

      if (songQuery || allSlideUrls.length > 1 || !hasMetaApi) {
        await updateMenfessStatus(id, "queued", {
          image_url: allSlideUrls[0],
          slides_json: slidesJson,
          song_query: songQuery,
        });

        return c.json({
          success: true,
          id,
          status: "queued",
          slidesCount: allSlideUrls.length,
          song_query: songQuery,
          message: songQuery
            ? "Menfess berlagu kamu berhasil masuk antrean postingan!"
            : "Menfess kamu berhasil masuk antrean postingan!",
        });
      }

      const caption = `[Stembayo Menfess #${id.slice(0, 8)}]\n\n"${primaryContent}"\n\n---\nKirim pesan anonim via link di bio!\n#stembayomenfess #menfess #tembayo`;
      const igRes = await publishToInstagram({
        imageUrl: allSlideUrls[0],
        caption,
      });

      await updateMenfessStatus(id, "posted", {
        image_url: allSlideUrls[0],
        ig_media_id: igRes.mediaId,
        ig_permalink: igRes.permalink,
        slides_json: slidesJson,
        posted_at: Date.now(),
      });

      return c.json({
        success: true,
        id,
        status: "posted",
        permalink: igRes.permalink,
      });
    } catch (err: any) {
      console.error("[Post Processing Error]", err);
      await updateMenfessStatus(id, "failed", {
        flag_reason: `Gagal memproses gambar/pos: ${err.message}`,
      });
      return c.json(
        {
          success: false,
          error: "Gagal memproses gambar slide atau menerbitkan ke Instagram.",
          detail: err.message,
        },
        500
      );
    }
  }

  // --- Legacy / Direct Single Post Flow ---
  // Validate uploaded files
  if (uploadedFiles.length > 4) {
    return c.json({ success: false, error: "Maksimal 4 foto lampiran." }, 400);
  }

  const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB
  const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

  for (const file of uploadedFiles) {
    if (file.size > MAX_FILE_SIZE) {
      return c.json(
        { success: false, error: `Foto "${file.name}" melebihi batas 2MB.` },
        400
      );
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      return c.json(
        {
          success: false,
          error: `Format foto "${file.name}" tidak didukung. Gunakan JPG, PNG, atau WebP.`,
        },
        400
      );
    }
  }

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
    flag_reason: modResult.passed
      ? null
      : modResult.flagReason || "Terindikasi perlu tinjauan",
    song_query: songQuery || null,
    slides_json: null,
    created_at: now,
    posted_at: null,
  };
  await insertMenfess(initialRecord);

  try {
    // 1. Generate Slide 1 Image Card
    const imageBuffer = await generateMenfessImage({ content, id });
    const slide1Promise = uploadImageToCloud(imageBuffer, `menfess_${id}_slide1`);

    // 2. Upload any attached user photos to Cloudinary framed inside Menfesskan card
    const attachmentPromises = uploadedFiles.map(async (file, i) => {
      const arrayBuf = await file.arrayBuffer();
      const photoBuf = Buffer.from(arrayBuf);
      const framedPhotoBuf = await generateMenfessPhotoImage({
        photoBuffer: photoBuf,
        photoMime: file.type || "image/jpeg",
        id,
      });
      return uploadImageToCloud(framedPhotoBuf, `menfess_${id}_slide_${i + 2}`);
    });

    const [uploadRes, ...attachmentUploads] = await Promise.all([
      slide1Promise,
      ...attachmentPromises,
    ]);

    const allSlideUrls: string[] = [
      uploadRes.url,
      ...attachmentUploads.map((res) => res.url),
    ];

    const slidesJson = JSON.stringify(allSlideUrls);

    // If content was flagged by moderation rules, preserve assets and hold for admin review
    if (!modResult.passed) {
      await updateMenfessStatus(id, "flagged", {
        image_url: uploadRes.url,
        slides_json: slidesJson,
        song_query: songQuery,
      });

      return c.json({
        success: true,
        id,
        status: "flagged",
        flagReason: modResult.flagReason,
        message: "Menfess masuk antrean karantina admin.",
      });
    }

    const hasMetaApi = Boolean(process.env.INSTAGRAM_ACCOUNT_ID && process.env.META_ACCESS_TOKEN);

    // If song is requested OR multiple slides present OR Meta Graph API is not configured -> Queue for Python Publisher Worker!
    if (songQuery || uploadedFiles.length > 0 || !hasMetaApi) {
      await updateMenfessStatus(id, "queued", {
        image_url: uploadRes.url,
        slides_json: slidesJson,
        song_query: songQuery,
      });

      return c.json({
        success: true,
        id,
        status: "queued",
        slidesCount: allSlideUrls.length,
        song_query: songQuery,
        message: songQuery
          ? "Menfess berlagu kamu berhasil masuk antrean postingan!"
          : "Menfess kamu berhasil masuk antrean postingan!",
      });
    }

    // Single text card without song AND Meta credentials configured -> Post directly to Meta Graph API
    const caption = `[Stembayo Menfess #${id.slice(0, 8)}]\n\n"${content}"\n\n---\nKirim pesan anonim via link di bio!\n#stembayomenfess #menfess #tembayo`;
    const igRes = await publishToInstagram({
      imageUrl: uploadRes.url,
      caption,
    });

    await updateMenfessStatus(id, "posted", {
      image_url: uploadRes.url,
      slides_json: slidesJson,
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
      flag_reason: `Gagal memproses menfess: ${err.message}`,
    });

    return c.json(
      {
        success: false,
        error: `Gagal memproses pengiriman: ${err.message}`,
      },
      500
    );
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
    let slidesJson = record.slides_json;

    if (!imageUrl) {
      const buffer = await generateMenfessImage({ content: record.content, id });
      const upload = await uploadImageToCloud(buffer, `menfess_${id}_slide1`);
      imageUrl = upload.url;
      slidesJson = JSON.stringify([imageUrl]);
    }

    const hasMetaApi = Boolean(process.env.INSTAGRAM_ACCOUNT_ID && process.env.META_ACCESS_TOKEN);
    let slideCount = 1;
    if (slidesJson) {
      try {
        const parsed = JSON.parse(slidesJson);
        if (Array.isArray(parsed)) slideCount = parsed.length;
      } catch {}
    }
    const hasSongOrSlides = Boolean(record.song_query || slideCount > 1);

    // If request contains song, multiple slides, or Meta API is not configured -> Queue for worker!
    if (hasSongOrSlides || !hasMetaApi) {
      await updateMenfessStatus(id, "queued", {
        image_url: imageUrl,
        slides_json: slidesJson,
      });

      return c.json({
        success: true,
        status: "queued",
        message: "Menfess disetujui dan diteruskan ke antrean postingan worker.",
      });
    }

    const caption = `[Stembayo Menfess #${id.slice(0, 8)}]\n\n"${record.content}"\n\n---\nKirim pesan anonim via link di bio!\n#stembayomenfess #menfess #tembayo`;
    const igRes = await publishToInstagram({ imageUrl, caption });

    await updateMenfessStatus(id, "posted", {
      image_url: imageUrl,
      slides_json: slidesJson,
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

// Vercel Serverless Function export: must be a function or server
const listener = getRequestListener(app.fetch);
export default Object.assign(listener, { fetch: app.fetch.bind(app) });

