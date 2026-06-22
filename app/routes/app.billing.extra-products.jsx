import { json, redirect } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { getShopifyAppUrl } from "../lib/env.server.js";
import {
  confirmExtraProductPackPurchase,
  requestExtraProductPackPurchase,
} from "../lib/billing-extra-products.server.js";

export async function loader({ request }) {
  const { admin, session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const chargeId = url.searchParams.get("charge_id");

  if (chargeId) {
    const result = await confirmExtraProductPackPurchase(admin, session.shop, chargeId);
    return redirect(`/app?productPack=${result.granted ? "ok" : "pending"}`);
  }

  const returnUrl = `${getShopifyAppUrl()}/app/billing/extra-products?shop=${encodeURIComponent(session.shop)}`;
  const { confirmationUrl } = await requestExtraProductPackPurchase(admin, session.shop, returnUrl);
  return redirect(confirmationUrl);
}

export default function ExtraProductsBilling() {
  return null;
}
