import { Router } from "express";

const router = Router();

const healthHandler = (_req: any, res: any) => {
  res.json({ status: "ok", service: "Sentinel API (Node.js)", timestamp: new Date().toISOString() });
};
router.get("/health", healthHandler);
router.get("/healthz", healthHandler);

export default router;
