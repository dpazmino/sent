import { Router } from "express";
import healthRouter from "./routes/health.js";
import dashboardRouter from "./routes/dashboard.js";
import duplicatesRouter from "./routes/duplicates.js";
import paymentsRouter from "./routes/payments.js";
import schemaRouter from "./routes/schema.js";
import exportsRouter from "./routes/exports.js";
import trainingRouter from "./routes/training.js";
import userReviewsRouter from "./routes/userReviews.js";
import agentsRouter from "./routes/agents.js";
import consoleRouter from "./routes/console.js";

const router = Router();

// Health check lives at root of /py-api prefix
router.use("/", healthRouter);

// All other routes grouped by resource
router.use("/dashboard", dashboardRouter);
router.use("/duplicates", duplicatesRouter);
router.use("/payments", paymentsRouter);
router.use("/schema", schemaRouter);
router.use("/exports", exportsRouter);
router.use("/training", trainingRouter);
router.use("/user-reviews", userReviewsRouter);
router.use("/agents", agentsRouter);
router.use("/console", consoleRouter);

export default router;
