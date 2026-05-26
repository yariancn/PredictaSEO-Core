import { execSync } from "node:child_process";

function run(command) {
  execSync(command, { stdio: "inherit" });
}

run("npx prisma generate");

try {
  run("npx prisma migrate deploy");
  console.log("[PredictaCore] Database migrations applied.");
} catch {
  console.warn(
    "[PredictaCore] migrate deploy failed (often P3005 on legacy DB). Syncing schema with db push...",
  );
  run("npx prisma db push --skip-generate --accept-data-loss");
  console.log("[PredictaCore] Database schema synced.");
}
