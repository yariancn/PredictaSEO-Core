import prisma from "../db.server.js";
import { unauthenticated } from "../shopify.server";
import {
  APPLY_KIND,
  hasCompletedSetupApply,
  hasIncludedApplyThisPeriod,
  hasMonthlyRunThisPeriod,
  currentApplyPeriod,
} from "./apply-quota.server.js";
import { runStoreApply, recordSkippedMonthlyApply } from "./apply-runner.server.js";

export async function runMonthlyApplyForShop(shop) {
  const billing = await prisma.shopBilling.findUnique({ where: { shop } });
  if (!billing?.subscriptionActive) {
    return { shop, status: "skipped", reason: "no_subscription" };
  }

  if (!(await hasCompletedSetupApply(shop))) {
    return { shop, status: "skipped", reason: "setup_not_done" };
  }

  const period = currentApplyPeriod();
  if (await hasIncludedApplyThisPeriod(shop, period)) {
    return { shop, status: "skipped", reason: "included_apply_already_used_this_month" };
  }

  if (await hasMonthlyRunThisPeriod(shop, period)) {
    return { shop, status: "skipped", reason: "already_ran_this_month" };
  }

  let admin;
  try {
    ({ admin } = await unauthenticated.admin(shop));
  } catch (err) {
    return { shop, status: "failed", reason: "no_session", error: err.message };
  }

  try {
    const outcome = await runStoreApply(admin, shop, { applyKind: APPLY_KIND.MONTHLY });
    if (outcome.skipped) {
      await recordSkippedMonthlyApply(shop, outcome.reason ?? "no_changes");
      return { shop, status: "skipped", reason: outcome.reason ?? "no_changes" };
    }
    return { shop, status: "completed", batchId: outcome.batchId, applyResult: outcome.applyResult };
  } catch (err) {
    return { shop, status: "failed", reason: "apply_error", error: err.message ?? "Apply failed" };
  }
}

export async function runMonthlyApplyForAllShops() {
  const shops = await prisma.shopBilling.findMany({
    where: { subscriptionActive: true },
    select: { shop: true },
  });

  const results = [];
  for (const { shop } of shops) {
    results.push(await runMonthlyApplyForShop(shop));
  }

  return {
    period: currentApplyPeriod(),
    processed: results.length,
    completed: results.filter((r) => r.status === "completed").length,
    skipped: results.filter((r) => r.status === "skipped").length,
    failed: results.filter((r) => r.status === "failed").length,
    results,
  };
}
