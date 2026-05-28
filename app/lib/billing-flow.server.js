import { redirect } from "@remix-run/node";

/** Defer first $15 until next cycle — month 1 is covered by the $35 setup charge (not a free trial). */
export const MAINTENANCE_FIRST_CHARGE_DEFER_DAYS = 30;

/** Embedded-app return URLs — must stay inside Shopify Admin (not bare Railway URL). */
export function getBillingReturnUrls(shop) {
  const shopSlug = shop.replace(".myshopify.com", "");
  const adminApp = `https://admin.shopify.com/store/${shopSlug}/apps/predictacore-app`;
  return {
    adminReady: `${adminApp}?billing=ready`,
    chainSetup: `${adminApp}?billing=chain`,
  };
}

/** Setup ($35, month 1) then maintenance ($15/mo from next billing cycle). */
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
      trialDays: MAINTENANCE_FIRST_CHARGE_DEFER_DAYS,
      returnUrl: urls.adminReady,
    });
  }

  throw redirect(urls.adminReady);
}
