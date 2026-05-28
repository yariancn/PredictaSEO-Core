import { authenticate } from "../shopify.server";
import { syncSubscriptionFromWebhook } from "../lib/shop-lifecycle.server.js";

export const action = async ({ request }) => {
  const { shop, topic, payload } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  const result = await syncSubscriptionFromWebhook(shop, payload);
  if (result.updated) {
    console.log(`[PredictaCore] Subscription sync for ${shop}:`, JSON.stringify(result));
  }

  return new Response();
};
