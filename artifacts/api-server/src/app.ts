import express, { type Express } from "express";
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
          // req.url is relative to the mount path, e.g. "/" or "/?page=1&limit=15" or "/123"
          // Avoid trailing slash before query string which triggers FastAPI 307 redirects
          let relPath = req.url ?? "/";
          if (relPath === "/") {
            relPath = "";
          } else if (relPath.startsWith("/?")) {
            // Turn "/?foo=bar" → "?foo=bar" to avoid trailing slash
            relPath = relPath.slice(1);
          }
          proxyReq.path = `/py-api/${segment}${relPath}`;
        },
      },
    })
  );
}

app.use("/api", router);

export default app;
