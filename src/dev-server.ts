import { serve } from "@hono/node-server";
import { app } from "./app.js";
import dotenv from "dotenv";

dotenv.config();

const port = Number(process.env.PORT) || 3000;

console.log(`[Menfess Server] Berjalan di http://localhost:${port}`);
console.log(`[Menfess Admin]  Berjalan di http://localhost:${port}/admin`);

serve({
  fetch: app.fetch,
  port,
});

