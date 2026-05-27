import { authenticate } from "../shopify.server";
import { purgeShopData } from "../lib/shop-data.server.js";

export const action = async ({ request }) => {
  const { topic, shop, payload } = await authenticate.webhook(request);

  switch (topic) {
    case "CUSTOMERS_DATA_REQUEST":
      // PredictaCore does not store customer PII — only shop catalog/SEO data.
      console.log(`GDPR data request for ${shop}`, {
        dataRequestId: payload?.data_request?.id,
        customerId: payload?.customer?.id,
      });
      break;

    case "CUSTOMERS_REDACT":
      // No customer records are persisted by this app.
      console.log(`GDPR customer redact for ${shop}`, {
        customerId: payload?.customer?.id,
      });
      break;

    case "SHOP_REDACT":
      await purgeShopData(shop);
      console.log(`GDPR shop redact completed for ${shop}`);
      break;

    default:
      console.warn(`Unhandled compliance webhook topic: ${topic}`);
  }

  return new Response();
};
