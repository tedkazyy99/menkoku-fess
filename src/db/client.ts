import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const dbUrl = process.env.DATABASE_URL;

export interface ResultSet {
  columns: string[];
  columnTypes: string[];
  rows: any[];
  rowsAffected: number;
  lastInsertRowid: undefined;
  toJSON(): any;
}

export type InStatement = string | { sql: string; args?: any[] };

export interface DbExecutor {
  execute(stmt: InStatement): Promise<ResultSet>;
}

class PgDb implements DbExecutor {
  private pool: pg.Pool;

  constructor(connectionString: string) {
    this.pool = new pg.Pool({
      connectionString,
      ssl: false,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });

    this.pool.on("error", (err) => {
      console.error("[PostgreSQL Pool Error]", err);
    });
  }

  async execute(stmt: InStatement): Promise<ResultSet> {
    const rawSql = typeof stmt === "string" ? stmt : stmt.sql;
    const rawArgs = typeof stmt === "string" ? [] : (stmt.args || []);

    // Convert SQLite '?' parameter markers to PostgreSQL '$1, $2, ...'
    let paramIdx = 0;
    const pgSql = rawSql.replace(/\?/g, () => `$${++paramIdx}`);

    try {
      const res = await this.pool.query(pgSql, rawArgs);
      const cols = res.fields ? res.fields.map((f) => f.name) : [];
      return {
        columns: cols,
        columnTypes: cols.map(() => "text"),
        rows: res.rows || [],
        rowsAffected: res.rowCount || 0,
        lastInsertRowid: undefined,
        toJSON: () => ({ columns: cols, rows: res.rows }),
      };
    } catch (err: any) {
      if (err.message && (err.message.includes("already exists") || err.message.includes("duplicate column"))) {
        return {
          columns: [],
          columnTypes: [],
          rows: [],
          rowsAffected: 0,
          lastInsertRowid: undefined,
          toJSON: () => ({}),
        };
      }
      console.error("[Database] PostgreSQL query error:", err.message);
      throw err;
    }
  }
}

function createDbExecutor(): DbExecutor {
  if (dbUrl && (dbUrl.startsWith("postgres://") || dbUrl.startsWith("postgresql://"))) {
    return new PgDb(dbUrl);
  }

  throw new Error(
    "[Database] DATABASE_URL (PostgreSQL) belum diatur di .env! Harap konfigurasi DATABASE_URL."
  );
}

export const db: DbExecutor = createDbExecutor();
