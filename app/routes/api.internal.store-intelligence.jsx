import { json } from "@remix-run/node";
import { assertPilotInternalRequest } from "../lib/pilot-internal-auth.server.js";
import { buildStoreIntelligencePayload } from "../lib/store-intelligence-api.server.js";

/** predictacore.ai/ads pulls Shopify + Google + SEO from here — no Shopify vars in ads. */
export async function loader({ request }) {
  assertPilotInternalRequest(request);

  const url = new URL(request.url);
  const days = Math.min(90, Math.max(7, Number.parseInt(url.searchParams.get("days") ?? "30", 10) || 30));

  const payload = await buildStoreIntelligencePayload(days);
  return json(payload);
}

export async function action() {
  return json({ error: "Use GET" }, { status: 405 });
}
