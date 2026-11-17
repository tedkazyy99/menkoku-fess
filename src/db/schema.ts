import { db } from "./client.js";

export interface MenfessRecord {
  id: string;
  content: string;
  status: "pending" | "posted" | "flagged" | "rejected" | "deleted" | "queued";
  image_url: string | null;
  ig_media_id: string | null;
  ig_permalink: string | null;
  flag_reason: string | null;
  song_query?: string | null;
  slides_json?: string | null;
  created_at: number;
  posted_at: number | null;
}

export async function initDb(): Promise<void> {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS menfess (
      id TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      status TEXT NOT NULL,
      image_url TEXT,
      ig_media_id TEXT,
      ig_permalink TEXT,
      flag_reason TEXT,
      song_query TEXT,
      slides_json TEXT,
      created_at INTEGER NOT NULL,
      posted_at INTEGER
    );
  `);

  // Migrasi aman untuk database yang sudah jalan
  try {
    await db.execute(`ALTER TABLE menfess ADD COLUMN song_query TEXT;`);
  } catch {}
  try {
    await db.execute(`ALTER TABLE menfess ADD COLUMN slides_json TEXT;`);
  } catch {}

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_menfess_status ON menfess(status);
  `);
  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_menfess_posted_at ON menfess(posted_at);
  `);

  // Persistent rate limiting table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS rate_limits (
      ip_hash TEXT PRIMARY KEY,
      last_seen INTEGER NOT NULL
    );
  `);
}

export async function getTodayPostedCount(): Promise<number> {
  // Rolling 24 hours
  const past24Hours = Date.now() - 24 * 60 * 60 * 1000;
  const result = await db.execute({
    sql: `SELECT COUNT(*) as count FROM menfess WHERE status = 'posted' AND posted_at >= ?`,
    args: [past24Hours],
  });

  const row = result.rows[0];
  return Number(row?.count || 0);
}

export async function checkDbRateLimit(
  ipHash: string,
  windowMs: number
): Promise<{ allowed: boolean; waitSeconds?: number }> {
  const now = Date.now();
  const res = await db.execute({
    sql: `SELECT last_seen FROM rate_limits WHERE ip_hash = ?`,
    args: [ipHash],
  });

  const row = res.rows[0];
  if (row) {
    const lastSeen = Number(row.last_seen);
    if (now - lastSeen < windowMs) {
      const waitSeconds = Math.ceil((windowMs - (now - lastSeen)) / 1000);
      return { allowed: false, waitSeconds };
    }
  }

  // Update or insert timestamp
  await db.execute({
    sql: `INSERT INTO rate_limits (ip_hash, last_seen) VALUES (?, ?)
          ON CONFLICT(ip_hash) DO UPDATE SET last_seen = ?`,
    args: [ipHash, now, now],
  });

  // Cleanup old entries (older than 1 day) occasionally
  if (Math.random() < 0.05) {
    const cutoff = now - 24 * 60 * 60 * 1000;
    db.execute({
      sql: `DELETE FROM rate_limits WHERE last_seen < ?`,
      args: [cutoff],
    }).catch(() => {});
  }

  return { allowed: true };
}

export async function insertMenfess(record: MenfessRecord): Promise<void> {
  await db.execute({
    sql: `INSERT INTO menfess (id, content, status, image_url, ig_media_id, ig_permalink, flag_reason, song_query, slides_json, created_at, posted_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      record.id,
      record.content,
      record.status,
      record.image_url,
      record.ig_media_id,
      record.ig_permalink,
      record.flag_reason,
      record.song_query || null,
      record.slides_json || null,
      record.created_at,
      record.posted_at,
    ],
  });
}

export async function updateMenfessStatus(
  id: string,
  status: MenfessRecord["status"],
  updates: Partial<Omit<MenfessRecord, "id" | "status" | "created_at">> = {}
): Promise<void> {
  const fields = ["status = ?"];
  const args: any[] = [status];

  if (updates.image_url !== undefined) {
    fields.push("image_url = ?");
    args.push(updates.image_url);
  }
  if (updates.ig_media_id !== undefined) {
    fields.push("ig_media_id = ?");
    args.push(updates.ig_media_id);
  }
  if (updates.ig_permalink !== undefined) {
    fields.push("ig_permalink = ?");
    args.push(updates.ig_permalink);
  }
  if (updates.flag_reason !== undefined) {
    fields.push("flag_reason = ?");
    args.push(updates.flag_reason);
  }
  if (updates.song_query !== undefined) {
    fields.push("song_query = ?");
    args.push(updates.song_query);
  }
  if (updates.slides_json !== undefined) {
    fields.push("slides_json = ?");
    args.push(updates.slides_json);
  }
  if (updates.posted_at !== undefined) {
    fields.push("posted_at = ?");
    args.push(updates.posted_at);
  }

  args.push(id);

  await db.execute({
    sql: `UPDATE menfess SET ${fields.join(", ")} WHERE id = ?`,
    args,
  });
}

export async function getMenfessList(limit = 50, status?: string): Promise<MenfessRecord[]> {
  let query = "SELECT * FROM menfess";
  const args: any[] = [];

  if (status) {
    query += " WHERE status = ?";
    args.push(status);
  }

  query += " ORDER BY created_at DESC LIMIT ?";
  args.push(limit);

  const result = await db.execute({ sql: query, args });
  return result.rows.map((r) => ({
    id: String(r.id),
    content: String(r.content),
    status: r.status as MenfessRecord["status"],
    image_url: r.image_url ? String(r.image_url) : null,
    ig_media_id: r.ig_media_id ? String(r.ig_media_id) : null,
    ig_permalink: r.ig_permalink ? String(r.ig_permalink) : null,
    flag_reason: r.flag_reason ? String(r.flag_reason) : null,
    song_query: r.song_query ? String(r.song_query) : null,
    slides_json: r.slides_json ? String(r.slides_json) : null,
    created_at: Number(r.created_at),
    posted_at: r.posted_at ? Number(r.posted_at) : null,
  }));
}

export async function getMenfessById(id: string): Promise<MenfessRecord | null> {
  const result = await db.execute({
    sql: "SELECT * FROM menfess WHERE id = ?",
    args: [id],
  });

  const row = result.rows[0];
  if (!row) return null;

  return {
    id: String(row.id),
    content: String(row.content),
    status: row.status as MenfessRecord["status"],
    image_url: row.image_url ? String(row.image_url) : null,
    ig_media_id: row.ig_media_id ? String(row.ig_media_id) : null,
    ig_permalink: row.ig_permalink ? String(row.ig_permalink) : null,
    flag_reason: row.flag_reason ? String(row.flag_reason) : null,
    song_query: row.song_query ? String(row.song_query) : null,
    slides_json: row.slides_json ? String(row.slides_json) : null,
    created_at: Number(row.created_at),
    posted_at: row.posted_at ? Number(row.posted_at) : null,
  };
}
