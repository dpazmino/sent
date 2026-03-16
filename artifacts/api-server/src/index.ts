import app from "./app";
import { spawn } from "child_process";
import path from "path";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// In production the Python FastAPI server is not managed by a separate workflow,
// so we spawn it here so both processes share the same container lifetime.
if (process.env["NODE_ENV"] !== "development") {
  const pyDir = path.resolve(process.cwd(), "artifacts/py-api");

  const pyProc = spawn("python", ["main.py"], {
    cwd: pyDir,
    stdio: "inherit",
    env: { ...process.env },
  });

  pyProc.on("error", (err: Error) => {
    console.error("[startup] Python server failed to start:", err.message);
  });

  pyProc.on("exit", (code: number | null) => {
    if (code !== 0) {
      console.error(`[startup] Python server exited with code ${code}`);
    }
  });

  console.log("[startup] Python FastAPI server spawned (port 8000)");
}

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
