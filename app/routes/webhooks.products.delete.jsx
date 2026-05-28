import { authenticate } from "../shopify.server";
import { handleProductDeletedWebhook } from "../lib/shop-lifecycle.server.js";

export const action = async ({ request }) => {
  const { shop, topic, payload } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  const productId = payload?.id ?? payload?.admin_graphql_api_id;
  const result = await handleProductDeletedWebhook(shop, productId);
  if (result.deleted > 0) {
    console.log(`[PredictaCore] Product delete cleanup for ${shop}:`, JSON.stringify(result));
  }

  return new Response();
};
