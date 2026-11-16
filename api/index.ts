import { getRequestListener } from "@hono/node-server";
import { app } from "../src/app.js";

const nodeHandler = getRequestListener(app.fetch);

function normalizeUrl(url: string): string {
  if (!url) return "/";
  if (url.startsWith("/api/index")) {
    const stripped = url.replace(/^\/api\/index/, "");
    return stripped === "" ? "/" : stripped;
  }
  return url;
}

const handler = Object.assign(
  function (req: any, res?: any) {
    if (req && req.url) {
      req.url = normalizeUrl(req.url);
    }
    if (res && typeof res.setHeader === "function") {
      return nodeHandler(req, res);
    }
    return app.fetch(req);
  },
  app,
  {
    fetch: (input: any, init?: any) => {
      let req = input;
      if (typeof input === "string") {
        req = normalizeUrl(input);
      } else if (input && typeof input.url === "string" && input.url.includes("/api/index")) {
        const u = new URL(input.url);
        u.pathname = normalizeUrl(u.pathname);
        req = new Request(u.toString(), input);
      }
      return app.fetch(req, init);
    },
    request: app.request.bind(app),
  }
);

export default handler;
