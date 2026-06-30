import { getShopifyAppHandle } from "./env.server.js";
import { getShopifyAppUrl } from "./env.server.js";

/** Embedded-app return URLs — must stay inside Shopify Admin (not bare Railway URL). */
export function getBillingReturnUrls(shop) {
  const shopSlug = shop.replace(".myshopify.com", "");
  const adminApp = `https://admin.shopify.com/store/${shopSlug}/apps/${getShopifyAppHandle()}`;
  const appUrl = getShopifyAppUrl();
  return {
    adminReady: `${adminApp}?billing=ready`,
    unifiedChain: appUrl ? `${appUrl}/app/billing/unified` : `${adminApp}/billing/unified`,
  };
}

/** $35 setup → auto-chain to $15/mo subscription approval (single button in app). */
export async function runBillingSetupFlow({ billing, session, isTest, SETUP_PLAN, syncBillingFromShopify, admin }) {
  const { runUnifiedBillingChain } = await import("./billing-unified.server.js");
  return runUnifiedBillingChain({
    admin,
    billing,
    session,
    isTest,
    SETUP_PLAN,
    syncBillingFromShopify,
  });
}
