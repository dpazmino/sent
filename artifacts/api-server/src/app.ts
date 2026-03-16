import express, { type Express } from "express";
import cors from "cors";
import router from "./routes/index.js";
import pyApiRouter from "./py-api/index.js";

const app: Express = express();

app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Mount the Sentinel API at both /py-api (original Python prefix) and /api (frontend prefix)
app.use("/py-api", pyApiRouter);
app.use("/api", pyApiRouter);

// Additional Express utility routes (health check, etc.)
app.use("/api", router);

export default app;
