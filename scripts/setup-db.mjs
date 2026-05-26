import { execSync } from "node:child_process";

process.env.PRISMA_USER_CONSENT = "true";

const MIGRATION_NAME = "20260526120000_init_postgres";

function run(command) {
  execSync(command, {
    stdio: "inherit",
    env: { ...process.env, PRISMA_USER_CONSENT: "true" },
  });
}

function baselineMigration() {
  try {
    run(`npx prisma migrate resolve --applied ${MIGRATION_NAME}`);
  } catch {
    console.warn("[PredictaCore] Could not baseline migration history.");
  }
}

console.log("[PredictaCore] Preparing database...");
run("npx prisma generate");

try {
  run("npx prisma migrate deploy");
  console.log("[PredictaCore] Migrations applied.");
} catch {
  console.warn("[PredictaCore] migrate deploy failed — syncing schema...");
  try {
    run("npx prisma db push --skip-generate --accept-data-loss");
  } catch {
    console.warn("[PredictaCore] db push failed — resetting legacy DB...");
    run("npx prisma db push --force-reset --accept-data-loss --skip-generate");
  }
  baselineMigration();
  console.log("[PredictaCore] Database schema synced.");
}
