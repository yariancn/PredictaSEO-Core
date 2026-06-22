import prisma from "../db.server.js";

export async function saveApplyImpactReport(shop, report) {
  const payload = JSON.stringify({
    ...report,
    savedAt: new Date().toISOString(),
  });
  await prisma.shopSettings.upsert({
    where: { shop },
    create: { shop, lastApplyReportJson: payload },
    update: { lastApplyReportJson: payload },
  });
}

export async function getApplyImpactReport(shop) {
  const row = await prisma.shopSettings.findUnique({ where: { shop } });
  if (!row?.lastApplyReportJson) return null;
  try {
    return JSON.parse(row.lastApplyReportJson);
  } catch {
    return null;
  }
}

export function buildApplyImpactSummary({
  beforeExec,
  afterExec,
  applyResult,
  preview,
  productTier,
  gscBefore = null,
  gscAfter = null,
  deliveryStatus = null,
}) {
  return {
    scoreBefore: beforeExec?.score ?? applyResult?.scoreBefore ?? 0,
    scoreAfter: afterExec?.score ?? applyResult?.scoreAfter ?? 0,
    projection: afterExec?.scoreProjection ?? beforeExec?.scoreProjection ?? null,
    probabilistic: afterExec?.probabilistic ?? beforeExec?.probabilistic ?? null,
    productsUpdated: applyResult?.productCount ?? applyResult?.applied ?? 0,
    productsInScope: productTier?.effectiveLimit ?? preview?.productCount ?? 0,
    schemaApplied: Boolean(applyResult?.schemaApplied),
    marketRegion: applyResult?.marketRegion ?? "",
    appliedAt: new Date().toISOString(),
    gscBefore: gscBefore
      ? { impressions: gscBefore.totalImpressions, clicks: gscBefore.totalClicks }
      : null,
    gscAfter: gscAfter
      ? { impressions: gscAfter.totalImpressions, clicks: gscAfter.totalClicks }
      : null,
    deliveryReady: deliveryStatus?.crawlerReady ?? null,
    deliveryPassed: deliveryStatus?.passed ?? null,
    deliveryTotal: deliveryStatus?.total ?? null,
    sampleChanges: (preview?.items ?? applyResult?.appliedItems ?? []).slice(0, 8).map((item) => ({
      title: item.title,
      category: item.category,
      aiGenerated: Boolean(item.aiGenerated),
      fields: Object.keys(item.changes ?? {}),
    })),
  };
}
