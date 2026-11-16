import { getRequestListener } from "@hono/node-server";
import { app } from "./app.js";

const listener = getRequestListener(app.fetch);

export { app };
export default Object.assign(listener, { fetch: app.fetch.bind(app) });
