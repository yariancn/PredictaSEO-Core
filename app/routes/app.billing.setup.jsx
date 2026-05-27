import { authenticate, SETUP_PLAN } from "../shopify.server";

export async function loader({ request }) {
  const { isBillingTest } = await import("../lib/billing.server.js");
  const { billing, session } = await authenticate.admin(request);
  const shopSlug = session.shop.replace(".myshopify.com", "");

  return billing.request({
    plan: SETUP_PLAN,
    isTest: isBillingTest(),
    returnUrl: `https://admin.shopify.com/store/${shopSlug}/apps/predictacore-app`,
  });
}

export default function BillingSetupRoute() {
  return null;
}
