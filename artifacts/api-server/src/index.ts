import app from "./app";
import { spawn, exec } from "child_process";
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

// Start Express first so the health check responds immediately.
app.listen(port, () => {
  console.log(`Server listening on port ${port}`);

  // In production the Python FastAPI server is not managed by a separate workflow.
  // Install its dependencies then spawn it right after Express is up.
  if (process.env["NODE_ENV"] !== "development") {
    const pyDir = path.resolve(process.cwd(), "artifacts/py-api");
    const requirementsPath = path.resolve(pyDir, "requirements.txt");

    console.log("[startup] Installing Python dependencies...");
    exec(
      `pip install --quiet -r "${requirementsPath}"`,
      (pipErr, _stdout, pipStderr) => {
        if (pipErr) {
          console.error("[startup] pip install failed:", pipStderr || pipErr.message);
        } else {
          console.log("[startup] Python dependencies ready.");
        }

        console.log("[startup] Spawning Python FastAPI server on port 8000...");
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
      },
    );
  }
});
