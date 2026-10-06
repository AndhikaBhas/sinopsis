#!/usr/bin/env node

// Load environment variables from .env file before starting the server
import { spawn } from "child_process";
import { config } from "dotenv";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

// Get the directory of this script
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from .env file
const result = config({ path: join(__dirname, ".env") });

if (result.error) {
  console.warn("Warning: Could not load .env file:", result.error.message);
} else {
  console.log("✅ Environment variables loaded from .env file");
}

// Verify storage configuration
const storageType = process.env.STORAGE_TYPE || "filesystem";
console.log(`📦 Storage Type: ${storageType}`);

if (storageType === "minio") {
  const minioVars = ["MINIO_ENDPOINT", "MINIO_USER", "MINIO_PASSWORD", "MINIO_BUCKET"];
  const missingVars = minioVars.filter((varName) => !process.env[varName]);

  if (missingVars.length > 0) {
    console.error("❌ Missing MinIO environment variables:", missingVars);
    process.exit(1);
  } else {
    console.log("✅ MinIO configuration verified");
  }
}

console.log("🚀 Starting production server...");

// Start the background worker using tsx (handles TypeScript)
// On Windows, use cmd.exe to run npx properly
const isWindows = process.platform === "win32";
const workerProcess = isWindows
  ? spawn("cmd.exe", ["/c", "npx", "tsx", "worker.js"], {
      stdio: "inherit",
      env: process.env,
      cwd: __dirname,
    })
  : spawn("npx", ["tsx", "worker.js"], {
      stdio: "inherit",
      env: process.env,
      cwd: __dirname,
    });

// Start the React Router server
// Set NODE_NO_WARNINGS to suppress the localstorage-file warning
const serverEnv = { ...process.env, NODE_NO_WARNINGS: "1" };
const serverProcess = isWindows
  ? spawn("cmd.exe", ["/c", "npx", "react-router-serve", "./build/server/index.js"], {
      stdio: "inherit",
      env: serverEnv,
      cwd: __dirname,
    })
  : spawn("npx", ["react-router-serve", "./build/server/index.js"], {
      stdio: "inherit",
      env: serverEnv,
      cwd: __dirname,
    });

// Handle process termination gracefully
process.on("SIGINT", () => {
  console.log("\n🛑 Shutting down server and worker...");
  workerProcess.kill("SIGINT");
  serverProcess.kill("SIGINT");
});

process.on("SIGTERM", () => {
  console.log("\n🛑 Shutting down server and worker...");
  workerProcess.kill("SIGTERM");
  serverProcess.kill("SIGTERM");
});

workerProcess.on("exit", (code) => {
  console.log(`Worker exited with code ${code}`);
});

serverProcess.on("exit", (code) => {
  console.log(`Server exited with code ${code}`);
  process.exit(code);
});

workerProcess.on("error", (error) => {
  console.error("Failed to start worker:", error);
});

serverProcess.on("error", (error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
