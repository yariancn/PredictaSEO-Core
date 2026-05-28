import { redirect } from "@remix-run/node";
import { authenticate, SETUP_PLAN, MAINTENANCE_PLAN } from "../shopify.server";
import { getBillingReturnUrls, MAINTENANCE_FIRST_CHARGE_DEFER_DAYS } from "../lib/billing-flow.server.js";

export async function loader({ request }) {
  const { isBillingTest, syncBillingFromShopify } = await import("../lib/billing.server.js");
  const { billing, session } = await authenticate.admin(request);
  const isTest = isBillingTest();
  const urls = getBillingReturnUrls(session.shop);

  const setupCheck = await billing.check({ plans: [SETUP_PLAN], isTest });
  const subCheck = await billing.check({ plans: [MAINTENANCE_PLAN], isTest });
  await syncBillingFromShopify(session.shop, setupCheck, subCheck);

  if (!setupCheck.hasActivePayment) {
    throw redirect("/app/billing/setup");
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

export default function BillingSubscribeRoute() {
  return null;
}

export async function headers(headersArgs) {
  const { boundary } = await import("@shopify/shopify-app-remix/server");
  return boundary.headers(headersArgs);
}
