import test from "node:test";
import assert from "node:assert/strict";
import { app } from "../src/app.js";

test("Music Autocomplete & Search Test Suite", async (t) => {
  await t.test("returns empty array when query is less than 2 characters", async () => {
    const res = await app.request("/api/music/search?q=a");
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.deepEqual(body.data, []);
  });

  await t.test("rejects query exceeding 80 characters", async () => {
    const longQuery = "a".repeat(85);
    const res = await app.request(`/api/music/search?q=${longQuery}`);
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.match(body.error, /terlalu panjang/i);
  });

  await t.test("successfully searches songs and returns normalized tracks", async () => {
    const res = await app.request("/api/music/search?q=nadin");
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(Array.isArray(body.data));
    assert.ok(body.data.length > 0, "Should return at least 1 track for query 'nadin'");

    const first = body.data[0];
    assert.ok(first.title, "Track must have title");
    assert.ok(first.artist, "Track must have artist");
    assert.ok(first.fullQuery.includes(" - "), "fullQuery must follow 'Artist - Title' format");
    assert.ok(first.artwork.startsWith("http"), "Artwork should be a valid URL");
  });

  await t.test("caches repeated queries in memory", async () => {
    const start = Date.now();
    const res1 = await app.request("/api/music/search?q=hindia");
    const dur1 = Date.now() - start;

    const start2 = Date.now();
    const res2 = await app.request("/api/music/search?q=hindia");
    const dur2 = Date.now() - start2;

    assert.equal(res1.status, 200);
    assert.equal(res2.status, 200);
    const body1 = await res1.json();
    const body2 = await res2.json();
    assert.deepEqual(body1.data, body2.data);
    // Cached response should be virtually instantaneous
    assert.ok(dur2 < dur1 || dur2 < 50, `Second response (${dur2}ms) should be fast cache hit`);
  });
});

