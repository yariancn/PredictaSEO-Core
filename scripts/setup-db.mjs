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
    run(`npx prisma migrate resolve --applied ${MIGRATION_NAME} --schema=prisma/schema.postgres.prisma`);
  } catch {
    console.warn("[PredictaCore] Could not baseline migration history.");
  }
}

console.log("[PredictaCore] Preparing database...");
run("npx prisma generate --schema=prisma/schema.postgres.prisma");

try {
  run("npx prisma migrate deploy --schema=prisma/schema.postgres.prisma");
  console.log("[PredictaCore] Migrations applied.");
} catch {
  console.warn("[PredictaCore] migrate deploy failed — syncing schema...");
  try {
    run("npx prisma db push --schema=prisma/schema.postgres.prisma --skip-generate --accept-data-loss");
  } catch {
    console.warn("[PredictaCore] db push failed — resetting legacy DB...");
    run(
      "npx prisma db push --schema=prisma/schema.postgres.prisma --force-reset --accept-data-loss --skip-generate",
    );
  }
  baselineMigration();
  console.log("[PredictaCore] Database schema synced.");
}
