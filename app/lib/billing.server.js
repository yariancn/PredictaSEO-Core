import prisma from "../db.server.js";

export const SETUP_PLAN = "SETUP";
export const MAINTENANCE_PLAN = "MAINTENANCE";

export function isBillingBypassed() {
  return process.env.BILLING_DISABLED === "true";
}

export function isBillingTest() {
  return process.env.SHOPIFY_BILLING_TEST === "true" || process.env.NODE_ENV !== "production";
}

export async function syncBillingFromShopify(shop, setupCheck, subCheck) {
  const setupPaid = setupCheck?.hasActivePayment ?? false;
  const subscriptionActive = subCheck?.hasActivePayment ?? false;

  return prisma.shopBilling.upsert({
    where: { shop },
    create: {
      shop,
      setupPaid,
      setupPaidAt: setupPaid ? new Date() : null,
      subscriptionActive,
    },
    update: {
      setupPaid,
      setupPaidAt: setupPaid ? new Date() : null,
      subscriptionActive,
    },
  });
}
