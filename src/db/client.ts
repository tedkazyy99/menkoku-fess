import { createClient, type Client, type InStatement, type ResultSet } from "@libsql/client/web";
import dotenv from "dotenv";
import { memoryDb } from "./memory.js";

dotenv.config();

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN || undefined;

export interface DbExecutor {
  execute(stmt: InStatement): Promise<ResultSet>;
}

let clientInstance: DbExecutor;

if (url && (url.startsWith("libsql:") || url.startsWith("https:") || url.startsWith("http:"))) {
  clientInstance = createClient({
    url,
    authToken,
  });
} else {
  console.warn(
    "[Database] TURSO_DATABASE_URL not set or not a web URL. Using high-performance memory store."
  );
  clientInstance = memoryDb;
}

export const db: DbExecutor = clientInstance;
