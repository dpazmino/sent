import express, { type Express, type Request } from "express";
import cors from "cors";
import router from "./routes";
import { createProxyMiddleware } from "http-proxy-middleware";

const app: Express = express();

app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

const PYTHON_API = "http://localhost:8000";

const pyPaths = [
  "duplicates",
  "dashboard",
  "agents",
  "training",
  "console",
  "schema",
  "exports",
];

for (const segment of pyPaths) {
  app.use(
    `/api/${segment}`,
    createProxyMiddleware({
      target: PYTHON_API,
      changeOrigin: true,
      on: {
        proxyReq: (proxyReq, req) => {
          // Fix the path: strip the leading slash that comes from req.url
          // req.url is relative to the mount point, e.g. "/" or "/chat" or "?page=1"
          let relPath = (req as Request).url ?? "/";
          if (relPath === "/") {
            relPath = "";
          } else if (relPath.startsWith("/?")) {
            // "/?foo=bar" → "?foo=bar" to avoid trailing slash redirect
            relPath = relPath.slice(1);
          }
          proxyReq.path = `/py-api/${segment}${relPath}`;

          // Re-write body: Express.json() has already consumed the stream,
          // so we need to write the parsed body back to the proxy request.
          const body = (req as any).body;
          if (body && Object.keys(body).length > 0) {
            const bodyData = JSON.stringify(body);
            proxyReq.setHeader("Content-Type", "application/json");
            proxyReq.setHeader("Content-Length", Buffer.byteLength(bodyData));
            proxyReq.write(bodyData);
          }
        },
      },
    })
  );
}

app.use("/api", router);

export default app;
