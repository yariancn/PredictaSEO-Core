import { redirect } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { getBillingReturnUrls } from "../lib/billing-flow.server.js";

/** Legacy route — maintenance billing is deferred; redirect to app home. */
export async function loader({ request }) {
  const { session } = await authenticate.admin(request);
  const urls = getBillingReturnUrls(session.shop);
  throw redirect(urls.adminReady);
}

export default function BillingSubscribeRoute() {
  return null;
}

export async function headers(headersArgs) {
  const { boundary } = await import("@shopify/shopify-app-remix/server");
  return boundary.headers(headersArgs);
}
