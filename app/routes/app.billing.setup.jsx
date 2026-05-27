import { json } from "@remix-run/node";
import { authenticate, SETUP_PLAN } from "../shopify.server";

export async function loader({ request }) {
  try {
    const { isBillingTest } = await import("../lib/billing.server.js");
    const { billing, session } = await authenticate.admin(request);
    const shopSlug = session.shop.replace(".myshopify.com", "");

    return billing.request({
      plan: SETUP_PLAN,
      isTest: isBillingTest(),
      returnUrl: `https://admin.shopify.com/store/${shopSlug}/apps/predictacore-app`,
    });
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error("[PredictaCore] billing setup failed:", error);
    const message =
      error instanceof Error && error.message ? error.message : "Billing setup failed";
    throw json({ message }, { status: 500 });
  }
}

export default function BillingSetupRoute() {
  return null;
}
