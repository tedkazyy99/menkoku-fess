import type { InStatement, ResultSet } from "@libsql/client/web";
import type { MenfessRecord } from "./schema.js";

class MemoryDb {
  private menfess: MenfessRecord[] = [];
  private rateLimits: Map<string, number> = new Map();

  async execute(stmt: InStatement): Promise<ResultSet> {
    const sql = (typeof stmt === "string" ? stmt : stmt.sql).trim();
    const rawArgs = typeof stmt === "string" ? [] : stmt.args;
    const args: any[] = Array.isArray(rawArgs) ? rawArgs : [];

    let rows: any[] = [];
    let columns: string[] = [];

    // 1. DDL Statements (No-ops in memory)
    if (
      sql.startsWith("CREATE TABLE") ||
      sql.startsWith("CREATE INDEX") ||
      sql.startsWith("PRAGMA")
    ) {
      rows = [];
    }

    // 2. Rate Limits SELECT
    else if (sql.includes("FROM rate_limits WHERE ip_hash = ?")) {
      const ipHash = String(args[0]);
      const lastSeen = this.rateLimits.get(ipHash);
      if (lastSeen !== undefined) {
        rows = [{ last_seen: lastSeen }];
        columns = ["last_seen"];
      }
    }

    // 3. Rate Limits INSERT / UPDATE
    else if (sql.includes("INSERT INTO rate_limits")) {
      const ipHash = String(args[0]);
      const lastSeen = Number(args[1]);
      this.rateLimits.set(ipHash, lastSeen);
    }

    // 4. Rate Limits DELETE
    else if (sql.includes("DELETE FROM rate_limits")) {
      const cutoff = Number(args[0]);
      for (const [ip, time] of this.rateLimits.entries()) {
        if (time < cutoff) this.rateLimits.delete(ip);
      }
    }

    // 5. Menfess Count Posted in 24h
    else if (sql.includes("SELECT COUNT(*) as count FROM menfess")) {
      const cutoff = Number(args[0]);
      const count = this.menfess.filter(
        (m) => m.status === "posted" && (m.posted_at || 0) >= cutoff
      ).length;
      rows = [{ count }];
      columns = ["count"];
    }

    // 6. Menfess INSERT
    else if (sql.includes("INSERT INTO menfess")) {
      const [
        id,
        content,
        status,
        image_url,
        ig_media_id,
        ig_permalink,
        flag_reason,
        created_at,
        posted_at,
      ] = args;
      this.menfess.unshift({
        id: String(id),
        content: String(content),
        status: status as MenfessRecord["status"],
        image_url: image_url ? String(image_url) : null,
        ig_media_id: ig_media_id ? String(ig_media_id) : null,
        ig_permalink: ig_permalink ? String(ig_permalink) : null,
        flag_reason: flag_reason ? String(flag_reason) : null,
        created_at: Number(created_at),
        posted_at: posted_at ? Number(posted_at) : null,
      });
    }

    // 7. Menfess UPDATE
    else if (sql.startsWith("UPDATE menfess SET")) {
      const id = String(args[args.length - 1]);
      const record = this.menfess.find((m) => m.id === id);
      if (record) {
        const setClause = sql.split("WHERE")[0].replace("UPDATE menfess SET", "");
        const assignments = setClause.split(",").map((s) => s.trim());
        assignments.forEach((assignment, index) => {
          const field = assignment.split("=")[0].trim() as keyof MenfessRecord;
          (record as any)[field] = args[index];
        });
      }
    }

    // 8. Menfess SELECT by ID
    else if (sql.includes("FROM menfess WHERE id = ?")) {
      const id = String(args[0]);
      const record = this.menfess.find((m) => m.id === id);
      rows = record ? [{ ...record }] : [];
    }

    // 9. Menfess SELECT List
    else if (sql.startsWith("SELECT * FROM menfess")) {
      let list = [...this.menfess];
      if (sql.includes("WHERE status = ?")) {
        const status = args[0];
        list = list.filter((m) => m.status === status);
      }
      list.sort((a, b) => b.created_at - a.created_at);
      const limit = Number(args[args.length - 1] || 50);
      rows = list.slice(0, limit).map((m) => ({ ...m }));
    }

    return {
      rows,
      columns,
      rowsAffected: 0,
      lastInsertRowid: undefined,
      toJSON: () => ({ rows, columns }),
      columnTypes: [],
    } as unknown as ResultSet;
  }
}

export const memoryDb = new MemoryDb();
