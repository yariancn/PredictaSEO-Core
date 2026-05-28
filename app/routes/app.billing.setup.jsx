import { json } from "@remix-run/node";
import { authenticate, SETUP_PLAN } from "../shopify.server";
import { runBillingSetupFlow } from "../lib/billing-flow.server.js";

export async function loader({ request }) {
  try {
    const { isBillingTest, syncBillingFromShopify } = await import("../lib/billing.server.js");
    const { billing, session } = await authenticate.admin(request);

    return runBillingSetupFlow({
      billing,
      session,
      isTest: isBillingTest(),
      SETUP_PLAN,
      syncBillingFromShopify,
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

export async function headers(headersArgs) {
  const { boundary } = await import("@shopify/shopify-app-remix/server");
  return boundary.headers(headersArgs);
}
