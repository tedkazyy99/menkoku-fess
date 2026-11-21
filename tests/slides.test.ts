process.env.NODE_ENV = "test";
import test from "node:test";
import assert from "node:assert/strict";
import { app } from "../src/app.js";
import { initDb } from "../src/db/schema.js";
import { db } from "../src/db/client.js";

test("Dynamic Multi-Slide Carousel Test Suite", async (t) => {
  await initDb();

  await t.test("rejects when slide count exceeds 5", async () => {
    const randomIp = `192.168.10.${Math.floor(Math.random() * 200) + 1}`;
    const slides = Array.from({ length: 6 }, (_, i) => ({
      type: "text",
      content: `Pesan slide nomor ${i + 1}`,
    }));

    const res = await app.request("/api/menfess", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": randomIp,
      },
      body: JSON.stringify({
        slides_meta: JSON.stringify(slides),
      }),
    });

    assert.equal(res.status, 400);
    const data = await res.json();
    assert.equal(data.success, false);
    assert.match(data.error, /antara 1 sampai 5/i);
  });

  await t.test("successfully queues multi-slide text confession", async () => {
    const randomIp = `192.168.11.${Math.floor(Math.random() * 200) + 1}`;
    const slides = [
      { type: "text", content: "Slide 1: Halo semua salam kenal" },
      { type: "text", content: "Slide 2: Ini pesan kedua untuk kalian" },
    ];

    const res = await app.request("/api/menfess", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": randomIp,
      },
      body: JSON.stringify({
        slides_meta: JSON.stringify(slides),
      }),
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.status, "queued");
    assert.equal(data.slidesCount, 2);

    // Clean up test record immediately
    if (data.id) {
      await db.execute({ sql: "DELETE FROM menfess WHERE id = ?", args: [data.id] });
    }
  });

  await t.test("successfully frames photo slide inside Menfesskan card", async () => {
    const randomIp = `192.168.12.${Math.floor(Math.random() * 200) + 1}`;
    const tinyPngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    const pngBuffer = Buffer.from(tinyPngBase64, "base64");
    const testFile = new File([pngBuffer], "sample.png", { type: "image/png" });

    const formData = new FormData();
    formData.append("slides_meta", JSON.stringify([{ type: "image", fileIndex: 0 }]));
    formData.append("images", testFile);

    const res = await app.request("/api/menfess", {
      method: "POST",
      headers: {
        "x-forwarded-for": randomIp,
      },
      body: formData,
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.status, "queued");
    assert.equal(data.slidesCount, 1);

    if (data.id) {
      await db.execute({ sql: "DELETE FROM menfess WHERE id = ?", args: [data.id] });
    }
  });
});

