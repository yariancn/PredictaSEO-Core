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
  const snap = await prisma.optimizationSnapshot.findFirst({ where: { shop } });
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

export async function getExtraApplyCredits(shop) {
  const billing = await prisma.shopBilling.findUnique({ where: { shop } });
  return billing?.extraApplyCredits ?? 0;
}

export async function grantExtraApplyCredit(shop, chargeId = null) {
  if (chargeId) {
    const existing = await prisma.processedBillingCharge.findUnique({ where: { id: chargeId } });
    if (existing) return false;
    await prisma.processedBillingCharge.create({
      data: { id: chargeId, shop, kind: "extra_apply" },
    });
  }

  await prisma.shopBilling.upsert({
    where: { shop },
    create: { shop, extraApplyCredits: 1 },
    update: { extraApplyCredits: { increment: 1 } },
  });
  return true;
}

export async function consumeExtraApplyCredit(shop) {
  const billing = await prisma.shopBilling.findUnique({ where: { shop } });
  if (!billing || billing.extraApplyCredits < 1) return false;
  await prisma.shopBilling.update({
    where: { shop },
    data: { extraApplyCredits: { decrement: 1 } },
  });
  return true;
}

/**
 * Manual apply from the wizard (merchant-initiated).
 * After setup: only extra-credit applies unless pilot mode.
 */
export async function resolveManualApplyPermission(shop, { pilotMode = false, setupPaid = false, subscriptionActive = false }) {
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

  const credits = await getExtraApplyCredits(shop);
  if (credits > 0) {
    return { allowed: true, kind: APPLY_KIND.EXTRA, reason: "extra_credit", credits };
  }

  const period = currentApplyPeriod();
  const includedUsed = await hasIncludedApplyThisPeriod(shop, period);
  const monthlyDone = await hasMonthlyRunThisPeriod(shop, period);

  if (subscriptionActive && !includedUsed && !monthlyDone) {
    return { allowed: false, reason: "monthly_auto_scheduled", period };
  }

  if (includedUsed || monthlyDone) {
    return { allowed: false, reason: "quota_exhausted", needsExtraPayment: true, period };
  }

  // Post-setup, new month, no active maintenance — manual re-apply requires extra payment.
  return { allowed: false, reason: "quota_exhausted", needsExtraPayment: true, period };
}

export async function recordApplyRun(shop, { kind, batchId = null, status = APPLY_STATUS.COMPLETED, note = null }) {
  const period = currentApplyPeriod();
  return prisma.applyRun.create({
    data: { shop, period, kind, batchId, status, note },
  });
}

export async function getApplyQuotaStatus(shop, billing = {}) {
  const period = currentApplyPeriod();
  const setupDone = await hasRecordedSetupApply(shop);
  const monthlyAutoDone = await hasMonthlyRunThisPeriod(shop, period);
  const includedApplyUsed = await hasIncludedApplyThisPeriod(shop, period);
  const extraApplyCredits = await getExtraApplyCredits(shop);
  const permission = await resolveManualApplyPermission(shop, billing);

  const extraRunsThisPeriod = await prisma.applyRun.count({
    where: {
      shop,
      period,
      kind: APPLY_KIND.EXTRA,
      status: APPLY_STATUS.COMPLETED,
    },
  });

  return {
    period,
    setupDone,
    monthlyAutoDone,
    includedApplyUsed,
    extraRunsThisPeriod,
    extraApplyCredits,
    canManualApply: permission.allowed,
    manualApplyKind: permission.kind ?? null,
    blockReason: permission.allowed ? null : permission.reason,
    needsExtraPayment: permission.needsExtraPayment ?? false,
    subscriptionActive: Boolean(billing.subscriptionActive),
    setupPaid: Boolean(billing.setupPaid),
    pilotMode: Boolean(billing.pilotMode),
  };
}
