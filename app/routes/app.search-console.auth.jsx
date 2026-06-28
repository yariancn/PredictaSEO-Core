import { redirect } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { buildSearchConsoleAuthUrl } from "../lib/search-console.server.js";
import crypto from "node:crypto";

/** Google OAuth must leave the embedded iframe — use Shopify exit-iframe (not window.top). */
export async function loader({ request }) {
  const { session } = await authenticate.admin(request);
  const state = crypto.randomBytes(16).toString("hex");
  const googleUrl = buildSearchConsoleAuthUrl(session.shop, state);

  const requestUrl = new URL(request.url);
  const isEmbedded = requestUrl.searchParams.get("embedded") === "1";

  if (isEmbedded) {
    const params = new URLSearchParams({
      shop: session.shop,
      exitIframe: googleUrl,
    });
    const host = requestUrl.searchParams.get("host");
    if (host) params.set("host", host);
    throw redirect(`/auth/exit-iframe?${params.toString()}`);
  }

  throw redirect(googleUrl);
}

export default function SearchConsoleAuth() {
  return null;
}
