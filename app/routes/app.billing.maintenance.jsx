import { redirect } from "@remix-run/node";

/** Legacy route — unified chain handles setup + subscription. */
export async function loader() {
  return redirect("/app/billing/unified");
}

export default function MaintenanceBilling() {
  return null;
}
