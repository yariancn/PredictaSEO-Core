import { spawn } from "node:child_process";

const port = process.env.PORT || "3000";
const host = process.env.HOST || "0.0.0.0";

if (!process.env.SHOPIFY_APP_URL?.trim()) {
  if (process.env.RAILWAY_PUBLIC_DOMAIN?.trim()) {
    process.env.SHOPIFY_APP_URL = `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
  } else if (process.env.NODE_ENV === "production") {
    process.env.SHOPIFY_APP_URL =
      "https://predictaseo-core-production.up.railway.app";
  }
}

console.log(`[PredictaCore] SHOPIFY_APP_URL=${process.env.SHOPIFY_APP_URL || "missing"}`);

const hasClientSecret = Boolean(
  process.env.SHOPIFY_CLIENT_SECRET?.trim() || process.env.SHOPIFY_API_SECRET?.trim(),
);
console.log(`[PredictaCore] SHOPIFY_CLIENT_SECRET=${hasClientSecret ? "set" : "MISSING"}`);

if (process.env.NODE_ENV === "production" && !hasClientSecret) {
  console.error(
    "[PredictaCore] FATAL: Set SHOPIFY_CLIENT_SECRET (or SHOPIFY_API_SECRET) in Railway Variables.",
  );
  process.exit(1);
}

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
