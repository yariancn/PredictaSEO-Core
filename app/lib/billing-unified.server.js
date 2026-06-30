import { redirect } from "@remix-run/node";
import { getShopifyAppHandle } from "./env.server.js";
import { getBillingReturnUrls } from "./billing-flow.server.js";
import {
  createMaintenanceSubscription,
  getMaintenanceSubscriptionStatus,
} from "./billing-maintenance.server.js";

function adminAppUrl(shop, query = "") {
  const shopSlug = shop.replace(".myshopify.com", "");
  const q = query ? (query.startsWith("?") ? query : `?${query}`) : "";
  return `https://admin.shopify.com/store/${shopSlug}/apps/${getShopifyAppHandle()}${q}`;
}

/**
 * After $35 setup, auto-redirect merchant to $15/mo subscription approval (no in-app gate).
 * Shopify may show two approval screens — this chains them without returning to the wizard.
 */
export async function runUnifiedBillingChain({
  admin,
  session,
  billing,
  isTest,
  SETUP_PLAN,
  syncBillingFromShopify,
}) {
  const setupCheck = await billing.check({ plans: [SETUP_PLAN], isTest });
  await syncBillingFromShopify(session.shop, setupCheck, { maintenanceActive: false });
  const setupPaid = setupCheck.hasActivePayment;

  const maintenanceStatus = await getMaintenanceSubscriptionStatus(admin);

  if (setupPaid && maintenanceStatus.active) {
    await syncBillingFromShopify(session.shop, setupCheck, { maintenanceActive: true });
    throw redirect(adminAppUrl(session.shop, "billing=ready"));
  }

  if (setupPaid && !maintenanceStatus.active) {
    const result = await createMaintenanceSubscription(admin, session.shop, { isTest });
    if (result.confirmationUrl) {
      throw redirect(result.confirmationUrl);
    }
    throw redirect(adminAppUrl(session.shop, "billing=maintenance-pending"));
  }

  if (!setupPaid) {
    const urls = getBillingReturnUrls(session.shop);
    return billing.request({
      plan: SETUP_PLAN,
      isTest,
      returnUrl: urls.unifiedChain,
    });
  }

  throw redirect(adminAppUrl(session.shop, "billing=ready"));
}
