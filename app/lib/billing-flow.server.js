import { redirect } from "@remix-run/node";

/** Embedded-app return URLs — must stay inside Shopify Admin (not bare Railway URL). */
export function getBillingReturnUrls(shop) {
  const shopSlug = shop.replace(".myshopify.com", "");
  const adminApp = `https://admin.shopify.com/store/${shopSlug}/apps/predictacore-app`;
  return {
    adminReady: `${adminApp}?billing=ready`,
  };
}

/** Single merchant-facing charge: $35 setup (includes month 1). $15/mo is registered in background after payment. */
export async function runBillingSetupFlow({ billing, session, isTest, SETUP_PLAN, syncBillingFromShopify }) {
  const urls = getBillingReturnUrls(session.shop);

  const setupCheck = await billing.check({ plans: [SETUP_PLAN], isTest });
  await syncBillingFromShopify(session.shop, setupCheck);

  if (!setupCheck.hasActivePayment) {
    return billing.request({
      plan: SETUP_PLAN,
      isTest,
      returnUrl: urls.adminReady,
    });
  }

  const shopSlug = session.shop.replace(".myshopify.com", "");
  throw redirect(`https://admin.shopify.com/store/${shopSlug}/apps/predictacore-app?billing=already`);
}
