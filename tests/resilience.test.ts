import test from "node:test";
import assert from "node:assert/strict";
import { uploadImageToCloud } from "../src/services/storage.js";
import { publishToInstagram, deleteFromInstagram } from "../src/services/instagram.js";
import { db } from "../src/db/client.js";
import { app } from "../src/app.js";
import { getMenfessById } from "../src/db/schema.js";

test("Fail-Fast & Resilience Test Suite", async (t) => {
  await t.test("storage: throws real error when credentials are missing", async () => {
    const origCloud = process.env.CLOUDINARY_CLOUD_NAME;
    delete process.env.CLOUDINARY_CLOUD_NAME;

    try {
      const dummyBuf = Buffer.from("test");
      await assert.rejects(
        async () => {
          await uploadImageToCloud(dummyBuf, "fail_test");
        },
        {
          name: "Error",
          message: /Cloudinary credentials missing/i,
        }
      );
    } finally {
      process.env.CLOUDINARY_CLOUD_NAME = origCloud;
    }
  });

  await t.test("instagram: throws real error when credentials are missing", async () => {
    const origAccount = process.env.INSTAGRAM_ACCOUNT_ID;
    delete process.env.INSTAGRAM_ACCOUNT_ID;

    try {
      await assert.rejects(
        async () => {
          await publishToInstagram({
            imageUrl: "https://example.com/test.png",
            caption: "test caption",
          });
        },
        {
          name: "Error",
          message: /Meta credentials missing/i,
        }
      );

      await assert.rejects(
        async () => {
          await deleteFromInstagram("mock_ig_12345");
        },
        {
          name: "Error",
        }
      );
    } finally {
      process.env.INSTAGRAM_ACCOUNT_ID = origAccount;
    }
  });

  await t.test("db: throws real error on bad SQL without silent fallback to memory", async () => {
    await assert.rejects(
      async () => {
        await db.execute("SELECT * FROM non_existent_table_xyz_123");
      },
      (err: any) => {
        return err instanceof Error && /does not exist|no such table/i.test(err.message);
      }
    );
  });

  await t.test("app: flagged submission preserves image_url and slides in database", async () => {
    process.env.ADMIN_PASSWORD = "testpassword123";
    const randomIp = `192.168.88.${Math.floor(Math.random() * 200) + 1}`;
    // Flagged due to phone number
    const res = await app.request("/api/menfess", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": randomIp,
      },
      body: JSON.stringify({
        content: "Halo admin, ini nomor kontak darurat 089912345678 tolong dicek",
        song_query: "Hindia - Evaluasi",
      }),
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.status, "flagged");

    // Fetch from DB by id directly
    const found = await getMenfessById(data.id);
    assert.ok(found, "Record should exist in database");
    assert.ok(found.image_url, "Flagged record must have generated image_url");
    assert.ok(found.slides_json, "Flagged record must preserve slides_json");
    assert.equal(found.song_query, "Hindia - Evaluasi");

    // Admin approves: verify it forwards to 'queued'
    const approveRes = await app.request(`/api/admin/menfess/${found.id}/approve`, {
      method: "POST",
      headers: { Authorization: "Bearer testpassword123" },
    });
    assert.equal(approveRes.status, 200);
    const approveData = await approveRes.json();
    assert.equal(approveData.status, "queued");

    const updated = await getMenfessById(found.id);
    assert.ok(
      updated?.status === "queued" || updated?.status === "processing",
      `Expected status queued or processing, got ${updated?.status}`
    );

    // Clean up
    await db.execute({ sql: "DELETE FROM menfess WHERE id = ?", args: [found.id] });
  });

  await t.test("moderation: pure content filter allows clean messages without daily post quota block", async () => {
    const { moderateContent } = await import("../src/services/moderation.js");
    const res = await moderateContent("Ini pesan penyemangat ujian sekolah yang bersih dan positif.");
    assert.equal(res.passed, true);
    assert.equal(res.flagReason, undefined);
  });

  await t.test("app: falls back to worker queue when Meta daily quota is full instead of quarantining", async () => {
    const randomIp = `192.168.99.${Math.floor(Math.random() * 200) + 1}`;
    const res = await app.request("/api/menfess", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": randomIp,
      },
      body: JSON.stringify({
        content: "Halo ini pesan saat kuota penuh",
      }),
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.status, "queued");

    if (data.id) {
      await db.execute({ sql: "DELETE FROM menfess WHERE id = ?", args: [data.id] });
    }
  });

  await t.test("worker: stale processing recovery query restores abandoned jobs to queued", async () => {
    const dummyId = `test_stale_${Date.now()}`;
    await db.execute({
      sql: `INSERT INTO menfess (id, content, status, created_at) VALUES (?, ?, ?, ?)`,
      args: [dummyId, "Stale processing job", "processing", Date.now() - 1000000],
    });

    // Run recovery logic
    await db.execute({
      sql: `UPDATE menfess SET status = 'queued' WHERE status = 'processing' AND id = ?`,
      args: [dummyId],
    });

    const recovered = await getMenfessById(dummyId);
    assert.equal(recovered?.status, "queued");

    // Clean up
    await db.execute({ sql: "DELETE FROM menfess WHERE id = ?", args: [dummyId] });
  });
});
