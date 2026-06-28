import { redirect } from "@remix-run/node";

const GROWTH_HUB_URL = "https://predictacore.ai/ads/clients/pam-andander/growth";

/** Intelligence hub lives on predictacore.ai — not in Shopify Admin. */
export async function loader() {
  return redirect(GROWTH_HUB_URL);
}

export default function GrowthRedirect() {
  return null;
}
