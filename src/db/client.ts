import { createClient } from "@libsql/client";
import dotenv from "dotenv";

dotenv.config();

// In serverless environments (Vercel / Lambda), the working dir is strictly read-only.
// If TURSO_DATABASE_URL is not set, fallback to the writable /tmp directory.
const isServerless =
  process.env.VERCEL === "1" || Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME);
const fallbackUrl = isServerless
  ? "file:/tmp/menfess_local.db"
  : "file:local.db";

const url = process.env.TURSO_DATABASE_URL || fallbackUrl;
const authToken = process.env.TURSO_AUTH_TOKEN || undefined;

export const db = createClient({
  url,
  authToken,
});
