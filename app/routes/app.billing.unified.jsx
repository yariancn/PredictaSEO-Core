import { authenticate, SETUP_PLAN } from "../shopify.server";
import { isBillingTest, syncBillingFromShopify } from "../lib/billing.server.js";
import { runUnifiedBillingChain } from "../lib/billing-unified.server.js";

export async function loader({ request }) {
  const { admin, session, billing } = await authenticate.admin(request);
  return runUnifiedBillingChain({
    admin,
    session,
    billing,
    isTest: isBillingTest(),
    SETUP_PLAN,
    syncBillingFromShopify,
  });
}

export default function UnifiedBillingRoute() {
  return null;
}

export async function headers(headersArgs) {
  const { boundary } = await import("@shopify/shopify-app-remix/server");
  return boundary.headers(headersArgs);
}
