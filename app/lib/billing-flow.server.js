import { redirect } from "@remix-run/node";
import { getShopifyAppUrl } from "./env.server.ts";

export const MAINTENANCE_TRIAL_DAYS = 30;

export function getBillingReturnUrls(shop) {
  const shopSlug = shop.replace(".myshopify.com", "");
  return {
    adminReady: `https://admin.shopify.com/store/${shopSlug}/apps/predictacore-app?billing=ready`,
    chainSetup: `${getShopifyAppUrl()}/app/billing/setup`,
  };
}

/** Setup ($35) then maintenance ($15/mo, first charge after trial). */
export async function runBillingSetupFlow({ billing, session, isTest, SETUP_PLAN, MAINTENANCE_PLAN, syncBillingFromShopify }) {
  const urls = getBillingReturnUrls(session.shop);

  const setupCheck = await billing.check({ plans: [SETUP_PLAN], isTest });
  const subCheck = await billing.check({ plans: [MAINTENANCE_PLAN], isTest });
  await syncBillingFromShopify(session.shop, setupCheck, subCheck);

  if (!setupCheck.hasActivePayment) {
    return billing.request({
      plan: SETUP_PLAN,
      isTest,
      returnUrl: urls.chainSetup,
    });
  }

  if (!subCheck.hasActivePayment) {
    return billing.request({
      plan: MAINTENANCE_PLAN,
      isTest,
      trialDays: MAINTENANCE_TRIAL_DAYS,
      returnUrl: urls.adminReady,
    });
  }

  throw redirect(urls.adminReady);
}
