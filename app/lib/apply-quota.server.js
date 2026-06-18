import prisma from "../db.server.js";

export const APPLY_KIND = {
  SETUP: "setup",
  MONTHLY: "monthly",
  EXTRA: "extra",
};

export const APPLY_STATUS = {
  COMPLETED: "completed",
  FAILED: "failed",
  SKIPPED: "skipped",
};

/** Calendar month bucket (UTC), e.g. "2026-05". */
export function currentApplyPeriod(date = new Date()) {
  return date.toISOString().slice(0, 7);
}

export async function hasLegacyApply(shop) {
  const { BASELINE_BATCH } = await import("./shop-baseline.server.js");
  const snap = await prisma.optimizationSnapshot.findFirst({
    where: { shop, batchId: { not: BASELINE_BATCH } },
  });
  return Boolean(snap);
}

/** True when a setup Apply was recorded (ApplyRun) or legacy snapshot exists — used for restore/dashboard. */
export async function hasCompletedSetupApply(shop) {
  const run = await prisma.applyRun.findFirst({
    where: { shop, kind: APPLY_KIND.SETUP, status: APPLY_STATUS.COMPLETED },
  });
  if (run) return true;
  return hasLegacyApply(shop);
}

/** Setup Apply recorded in ApplyRun only — billing/quota must not treat legacy backups as "already applied". */
export async function hasRecordedSetupApply(shop) {
  const run = await prisma.applyRun.findFirst({
    where: { shop, kind: APPLY_KIND.SETUP, status: APPLY_STATUS.COMPLETED },
  });
  return Boolean(run);
}

export async function hasIncludedApplyThisPeriod(shop, period = currentApplyPeriod()) {
  const run = await prisma.applyRun.findFirst({
    where: {
      shop,
      period,
      kind: { in: [APPLY_KIND.SETUP, APPLY_KIND.MONTHLY] },
      status: APPLY_STATUS.COMPLETED,
    },
  });
  return Boolean(run);
}

export async function hasMonthlyRunThisPeriod(shop, period = currentApplyPeriod()) {
  const run = await prisma.applyRun.findFirst({
    where: {
      shop,
      period,
      kind: APPLY_KIND.MONTHLY,
      status: { in: [APPLY_STATUS.COMPLETED, APPLY_STATUS.SKIPPED] },
    },
  });
  return Boolean(run);
}

/**
 * Manual apply from the wizard — one initial setup apply only.
 * Further updates run automatically once per month (cron). No extra paid scans.
 */
export async function resolveManualApplyPermission(shop, { pilotMode = false, setupPaid = false }) {
  if (pilotMode) {
    return { allowed: true, kind: APPLY_KIND.SETUP, reason: "pilot" };
  }

  if (!setupPaid) {
    return { allowed: false, reason: "setup_unpaid" };
  }

  const setupDone = await hasRecordedSetupApply(shop);
  if (!setupDone) {
    return { allowed: true, kind: APPLY_KIND.SETUP, reason: "setup_first" };
  }

  return { allowed: false, reason: "already_applied" };
}

/** @deprecated Extra apply disabled. */
export async function consumeExtraApplyCredit(_shop) {
  return false;
}

/** @deprecated Extra apply disabled — kept for legacy billing module compatibility. */
export async function grantExtraApplyCredit(shop) {
  return prisma.shopBilling.updateMany({
    where: { shop },
    data: { extraApplyCredits: 0 },
  });
}

export async function recordApplyRun(shop, { kind, batchId = null, status = APPLY_STATUS.COMPLETED, note = null }) {
  const period = currentApplyPeriod();
  return prisma.applyRun.create({
    data: { shop, period, kind, batchId, status, note },
  });
}

/** After restore, merchant can run their included setup Apply again. */
export async function resetApplyQuotaAfterRestore(shop) {
  await prisma.applyRun.deleteMany({ where: { shop } });
  await prisma.shopBilling.updateMany({
    where: { shop },
    data: { extraApplyCredits: 0 },
  });
}

export async function getApplyQuotaStatus(shop, billing = {}) {
  const period = currentApplyPeriod();
  const setupDone = await hasRecordedSetupApply(shop);
  const monthlyAutoDone = await hasMonthlyRunThisPeriod(shop, period);
  const includedApplyUsed = await hasIncludedApplyThisPeriod(shop, period);
  const permission = await resolveManualApplyPermission(shop, billing);

  return {
    period,
    setupDone,
    monthlyAutoDone,
    includedApplyUsed,
    canManualApply: permission.allowed,
    manualApplyKind: permission.kind ?? null,
    blockReason: permission.allowed ? null : permission.reason,
    needsExtraPayment: false,
    subscriptionActive: Boolean(billing.subscriptionActive),
    setupPaid: Boolean(billing.setupPaid),
    pilotMode: Boolean(billing.pilotMode),
  };
}
