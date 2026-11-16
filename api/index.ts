import { getRequestListener } from "@hono/node-server";
import { app } from "../src/app.js";

export const config = {
  runtime: "nodejs",
};

const nodeHandler = getRequestListener(app.fetch);

export default function handler(req: any, res?: any) {
  // If invoked with (req, res) by Node.js serverless runtime
  if (res && typeof res.setHeader === "function") {
    return nodeHandler(req, res);
  }
  // If invoked with standard Web Request
  return app.fetch(req);
}
