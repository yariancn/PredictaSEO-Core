import { unauthenticated } from "../shopify.server";
import { buildLlmsTxtForShop } from "../lib/validation.server.js";
import { buildMarketContext } from "../lib/markets.server.js";
import { CATALOG_QUERY } from "../lib/diagnostic.server.js";
import { getShopMarketSettings } from "../lib/shop-market.server.js";

export async function loader({ request }) {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  if (!shop) {
    return new Response("# llms.txt\n\nMissing shop parameter.\n", {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  try {
    const { admin } = await unauthenticated.admin(shop);
    const response = await admin.graphql(CATALOG_QUERY);
    const { data } = await response.json();
    const overrides = await getShopMarketSettings(shop);
    const marketContext = buildMarketContext(data, overrides);
    const text = buildLlmsTxtForShop(data.shop, marketContext);
    return new Response(text, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch {
    return new Response(`# ${shop}\n\nAI visibility data unavailable.\n`, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}
