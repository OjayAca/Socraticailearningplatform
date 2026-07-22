import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const environment = loadEnv("development", projectRoot, "");
const projectId = environment.VITE_FIREBASE_PROJECT_ID?.trim();

if (!projectId || projectId.startsWith("your_")) {
  console.error("VITE_FIREBASE_PROJECT_ID must be configured in .env before starting local development.");
  process.exit(1);
}

const firebaseCli = path.join(
  projectRoot,
  "node_modules",
  "firebase-tools",
  "lib",
  "bin",
  "firebase.js"
);

const childEnvironment = {
  ...process.env,
  VITE_USE_FUNCTIONS_EMULATOR: "true",
};

// The existing pilot configuration may still keep the Gemini credential in the
// root .env. Pass it only to the server-side emulator process; Vite does not read
// GEMINI_API_KEY because it has no VITE_ prefix.
if (!childEnvironment.GEMINI_API_KEY && environment.VITE_GEMINI_API_KEY) {
  childEnvironment.GEMINI_API_KEY = environment.VITE_GEMINI_API_KEY;
}

const child = spawn(
  process.execPath,
  [
    firebaseCli,
    "emulators:exec",
    "--only",
    "functions",
    "--project",
    projectId,
    "npm run dev:web",
  ],
  {
    cwd: projectRoot,
    env: childEnvironment,
    stdio: "inherit",
    windowsHide: true,
  }
);

child.on("error", (error) => {
  console.error(`Could not start the Firebase Functions emulator: ${error.message}`);
  process.exitCode = 1;
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exitCode = code ?? 1;
});
