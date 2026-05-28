import { authenticate } from "../shopify.server";
import {
  attemptAutomaticRestore,
  shopPayloadLooksInactive,
} from "../lib/shop-lifecycle.server.js";

export const action = async ({ request }) => {
  const { shop, topic, payload } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  if (!shopPayloadLooksInactive(payload)) {
    return new Response();
  }

  const result = await attemptAutomaticRestore(shop, "shop_inactive");
  console.log(`[PredictaCore] Shop inactive restore for ${shop}:`, JSON.stringify(result));

  return new Response();
};
