import { spawn } from "node:child_process";

const port = process.env.PORT || "3000";
const host = process.env.HOST || "0.0.0.0";

console.log(`[PredictaCore] Starting server on ${host}:${port}`);

const child = spawn(
  "npx",
  ["remix-serve", "./build/server/index.js"],
  {
    stdio: "inherit",
    env: { ...process.env, HOST: host, PORT: port },
  },
);

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});

process.on("SIGTERM", () => child.kill("SIGTERM"));
process.on("SIGINT", () => child.kill("SIGINT"));
