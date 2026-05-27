import { json } from "@remix-run/node";
import { authenticate, MAINTENANCE_PLAN } from "../shopify.server";

export async function loader({ request }) {
  try {
    const { isBillingTest } = await import("../lib/billing.server.js");
    const { billing, session } = await authenticate.admin(request);
    const shopSlug = session.shop.replace(".myshopify.com", "");

    return billing.request({
      plan: MAINTENANCE_PLAN,
      isTest: isBillingTest(),
      returnUrl: `https://admin.shopify.com/store/${shopSlug}/apps/predictacore-app`,
    });
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error("[PredictaCore] billing subscribe failed:", error);
    const message =
      error instanceof Error && error.message ? error.message : "Billing subscribe failed";
    throw json({ message }, { status: 500 });
  }
}

export default function BillingSubscribeRoute() {
  return null;
}
