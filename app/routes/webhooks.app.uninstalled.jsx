import { authenticate } from "../shopify.server";
import { purgeShopData } from "../lib/shop-data.server.js";

export const action = async ({ request }) => {
  const { shop, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  // Webhook requests can trigger multiple times and after an app has already been uninstalled.
  await purgeShopData(shop);

  return new Response();
};
