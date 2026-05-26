import { execSync } from "node:child_process";

process.env.PRISMA_USER_CONSENT = "true";

function run(command) {
  execSync(command, {
    stdio: "inherit",
    env: { ...process.env, PRISMA_USER_CONSENT: "true" },
  });
}

console.log("[PredictaCore] Preparing database...");
run("npx prisma generate");

try {
  run("npx prisma migrate deploy");
  console.log("[PredictaCore] Migrations applied.");
} catch {
  console.warn("[PredictaCore] migrate deploy failed — resetting legacy DB schema...");
  run(
    "npx prisma db push --force-reset --accept-data-loss --skip-generate",
  );
  console.log("[PredictaCore] Database reset and schema synced.");
}
