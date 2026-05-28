import prisma from "../db.server.js";

export const SETUP_PLAN = "SETUP";

export function isBillingBypassed() {
  return process.env.BILLING_DISABLED === "true";
}

export function isBillingTest() {
  return process.env.SHOPIFY_BILLING_TEST === "true" || process.env.NODE_ENV !== "production";
}

/**
 * After $35 setup is paid, the store is entitled to monthly updates.
 * Shopify recurring ($15/mo from month 2) is synced via webhook / background job.
 */
export async function syncBillingFromShopify(shop, setupCheck) {
  const setupPaid = setupCheck?.hasActivePayment ?? false;

  return prisma.shopBilling.upsert({
    where: { shop },
    create: {
      shop,
      setupPaid,
      setupPaidAt: setupPaid ? new Date() : null,
      subscriptionActive: setupPaid,
    },
    update: {
      setupPaid,
      setupPaidAt: setupPaid ? new Date() : null,
      subscriptionActive: setupPaid ? true : undefined,
    },
  });
}
