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

for (const path of pyPaths) {
  app.use(
    `/api/${path}`,
    createProxyMiddleware({
      target: PYTHON_API,
      changeOrigin: true,
      on: {
        proxyReq: (proxyReq, req) => {
          proxyReq.path = `/py-api/${path}${req.url === "/" ? "" : req.url}`;
        },
      },
    })
  );
}

app.use("/api", router);

export default app;
