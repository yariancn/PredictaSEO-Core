import { authenticate } from "../shopify.server";
import { handleShopOffboarding } from "../lib/shop-lifecycle.server.js";

export const action = async ({ request }) => {
  const { shop, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  const result = await handleShopOffboarding(shop, "uninstall");
  console.log(`[PredictaCore] Uninstall offboarding for ${shop}:`, JSON.stringify(result.restore));

  return new Response();
};
