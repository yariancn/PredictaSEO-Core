import { redirect } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { isBillingTest } from "../lib/billing.server.js";
import {
  ensureDeferredMaintenanceSubscription,
  getMaintenanceSubscriptionStatus,
} from "../lib/billing-maintenance.server.js";

export async function loader({ request }) {
  const { admin, session } = await authenticate.admin(request);
  const status = await getMaintenanceSubscriptionStatus(admin);

  if (status.active) {
    return redirect("/app?billing=maintenance-active");
  }

  const result = await ensureDeferredMaintenanceSubscription(admin, session.shop, {
    isTest: isBillingTest(),
  });

  if (result.confirmationUrl) {
    return redirect(result.confirmationUrl);
  }

  return redirect("/app?billing=maintenance-pending");
}

export default function MaintenanceBilling() {
  return null;
}
