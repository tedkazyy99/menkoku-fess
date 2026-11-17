import { createClient, type Client, type InStatement, type ResultSet } from "@libsql/client/web";
import dotenv from "dotenv";
import { memoryDb } from "./memory.js";

dotenv.config();

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN || undefined;

export interface DbExecutor {
  execute(stmt: InStatement): Promise<ResultSet>;
}

class ResilientDb implements DbExecutor {
  private tursoClient?: Client;

  constructor() {
    if (url && (url.startsWith("libsql:") || url.startsWith("https:") || url.startsWith("http:"))) {
      try {
        this.tursoClient = createClient({
          url,
          authToken,
        });
      } catch (e) {
        console.warn("[Database] Gagal inisialisasi Turso, fallback ke memory store:", e);
      }
    } else {
      console.warn("[Database] TURSO_DATABASE_URL belum diatur. Menggunakan memory store.");
    }
  }

  async execute(stmt: InStatement): Promise<ResultSet> {
    if (this.tursoClient) {
      try {
        return await this.tursoClient.execute(stmt);
      } catch (err: any) {
        // Abaikan error duplicate column saat migrasi
        if (err.message && err.message.includes("duplicate column")) {
          throw err;
        }

        console.error(
          "[Database] Turso query error (401 / jaringan). Otomatis fallback ke memory store:",
          err.message
        );
        return await memoryDb.execute(stmt);
      }
    }
    return await memoryDb.execute(stmt);
  }
}

export const db: DbExecutor = new ResilientDb();
