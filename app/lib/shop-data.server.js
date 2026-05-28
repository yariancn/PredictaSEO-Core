import prisma from "../db.server.js";

/** Remove all persisted data for a shop (GDPR shop/redact + uninstall cleanup). */
export async function purgeShopData(shop) {
  if (!shop) return { shop, deleted: {} };

  const [sessions, settings, profiles, snapshots, billing, applyRuns, charges] = await prisma.$transaction([
    prisma.session.deleteMany({ where: { shop } }),
    prisma.shopSettings.deleteMany({ where: { shop } }),
    prisma.entityProfile.deleteMany({ where: { shop } }),
    prisma.optimizationSnapshot.deleteMany({ where: { shop } }),
    prisma.shopBilling.deleteMany({ where: { shop } }),
    prisma.applyRun.deleteMany({ where: { shop } }),
    prisma.processedBillingCharge.deleteMany({ where: { shop } }),
  ]);

  return {
    shop,
    deleted: {
      sessions: sessions.count,
      shopSettings: settings.count,
      entityProfiles: profiles.count,
      optimizationSnapshots: snapshots.count,
      shopBilling: billing.count,
      applyRuns: applyRuns.count,
      processedBillingCharges: charges.count,
    },
  };
}
