import test from "node:test";
import assert from "node:assert/strict";
import { moderateContent, checkRateLimit } from "../src/services/moderation.js";
import { initDb } from "../src/db/schema.js";
import { app } from "../src/app.js";

test("Moderation & Rate Limiting Test Suite", async (t) => {
  await initDb();

  await t.test("rejects messages shorter than 5 chars", async () => {
    const res = await moderateContent("hai");
    assert.equal(res.passed, false);
    assert.equal(res.isHardReject, true);
  });

  await t.test("rejects messages longer than 800 chars", async () => {
    const longText = "a".repeat(801);
    const res = await moderateContent(longText);
    assert.equal(res.passed, false);
    assert.equal(res.isHardReject, true);
  });

  await t.test("accepts valid and clean messages", async () => {
    const res = await moderateContent("Semangat buat ulangan harian besok teman-teman!");
    assert.equal(res.passed, true);
  });

  await t.test("flags phone numbers for anti-doxxing", async () => {
    const res = await moderateContent("Hubungi aku di 081234567890 ya guys");
    assert.equal(res.passed, false);
    assert.match(res.flagReason || "", /nomor telepon/i);
    assert.equal(res.isHardReject, false);
  });

  await t.test("flags external links", async () => {
    const res = await moderateContent("Cek link ini ya https://example.com/join");
    assert.equal(res.passed, false);
    assert.match(res.flagReason || "", /tautan eksternal/i);
  });

  await t.test("flags blacklisted vulgar words", async () => {
    const res = await moderateContent("Dasar lu orang bangsat!");
    assert.equal(res.passed, false);
    assert.match(res.flagReason || "", /kata sensitif/i);
  });

  await t.test("enforces persistent database rate limit per IP", async () => {
    const testIp = `10.99.88.${Math.floor(Math.random() * 200) + 1}`;
    const firstCheck = await checkRateLimit(testIp);
    assert.equal(firstCheck.allowed, true);

    const secondCheck = await checkRateLimit(testIp);
    assert.equal(secondCheck.allowed, false);
    assert.ok((secondCheck.waitSeconds || 0) > 0);
  });

  await t.test("security: rejects unauthorized admin requests", async () => {
    const resNoAuth = await app.request("/api/admin/menfess");
    assert.equal(resNoAuth.status, 401);

    const resWrongAuth = await app.request("/api/admin/menfess", {
      headers: { Authorization: "Bearer wrongpassword" },
    });
    assert.equal(resWrongAuth.status, 401);
  });

  await t.test("security: accepts valid timing-safe admin authorization", async () => {
    process.env.ADMIN_PASSWORD = "testpassword123";
    const resValid = await app.request("/api/admin/menfess", {
      headers: { Authorization: "Bearer testpassword123" },
    });
    assert.equal(resValid.status, 200);
  });

  await t.test("queues songfess when song_query is provided", async () => {
    const randomIp = `192.168.77.${Math.floor(Math.random() * 200) + 1}`;
    const res = await app.request("/api/menfess", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": randomIp,
      },
      body: JSON.stringify({
        content: "Halo ini pesan songfess untuk crush di kelas sebelah",
        song_query: "Nadin Amizah - Rayuan Perempuan Gila",
      }),
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.status, "queued");
    assert.equal(data.song_query, "Nadin Amizah - Rayuan Perempuan Gila");
  });
});
