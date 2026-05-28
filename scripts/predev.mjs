import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const LOCAL_DB = "file:./dev.sqlite";

function loadEnvFile() {
  if (!existsSync(".env")) return;
  for (const line of readFileSync(".env", "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

function run(command) {
  execSync(command, { stdio: "inherit", env: process.env });
}

loadEnvFile();

if (!process.env.DATABASE_URL?.trim()) {
  process.env.DATABASE_URL = LOCAL_DB;
  console.log(`[PredictaCore] DATABASE_URL not set — using local SQLite (${LOCAL_DB})`);
}

console.log("[PredictaCore] Preparing local database…");
run("npx prisma generate");
run("npx prisma db push --skip-generate");
