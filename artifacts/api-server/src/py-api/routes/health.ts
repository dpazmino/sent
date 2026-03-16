import { Router } from "express";

const router = Router();

router.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "Sentinel API (Node.js)", timestamp: new Date().toISOString() });
});

export default router;
