import prisma from "../db.server.js";

/** Included with $35 setup + $15/mo — top sellers by sales ranking. */
export const BASE_PRODUCT_LIMIT = 500;

/** Each paid pack adds this many product slots. */
export const EXTRA_PRODUCT_PACK_SIZE = 50;

/** Max product slots (base + packs). */
export const MAX_PRODUCT_LIMIT = 2000;

/** Full Gemini SEO polish for top N products by sales; rest get market-aware templates. */
export const TOP_AI_PRODUCTS = 50;

/** GraphQL pool sizes (Shopify max 250 per page). */
export const CATALOG_POOL_LIMIT = 250;
export const BEST_SELLER_FETCH_LIMIT = 250;
export const SALES_RANKING_LIMIT = 1000;

/** One-time charge per extra product pack (USD). */
export const EXTRA_PRODUCT_PACK_PRICE = 25;

export const EXTRA_PRODUCT_PACK_KIND = "extra_product_pack";

export async function getShopProductTier(shop) {
  const billing = await prisma.shopBilling.findUnique({ where: { shop } });
  const extraPacks = billing?.extraProductPacks ?? 0;
  const effectiveLimit = Math.min(
    MAX_PRODUCT_LIMIT,
    BASE_PRODUCT_LIMIT + extraPacks * EXTRA_PRODUCT_PACK_SIZE,
  );
  return {
    baseLimit: BASE_PRODUCT_LIMIT,
    extraPacks,
    extraProductSlots: extraPacks * EXTRA_PRODUCT_PACK_SIZE,
    effectiveLimit,
    aiPolishLimit: TOP_AI_PRODUCTS,
    canExpand: effectiveLimit < MAX_PRODUCT_LIMIT,
    nextPackPrice: EXTRA_PRODUCT_PACK_PRICE,
    nextPackSize: EXTRA_PRODUCT_PACK_SIZE,
  };
}

export async function grantExtraProductPack(shop, packs = 1) {
  await prisma.shopBilling.upsert({
    where: { shop },
    create: { shop, extraProductPacks: packs },
    update: { extraProductPacks: { increment: packs } },
  });
  return getShopProductTier(shop);
}

/** Product IDs that receive full AI polish (by sales, then SEO gap score). */
export function selectAiProductIds(matrix, salesRanking, limit = TOP_AI_PRODUCTS) {
  const ranked = (matrix ?? [])
    .map((row) => ({
      id: row.product.id,
      orders: salesRanking?.byId?.get(row.product.id)?.orders ?? 0,
      score: row.score ?? 0,
    }))
    .sort((a, b) => {
      if (b.orders !== a.orders) return b.orders - a.orders;
      return b.score - a.score;
    });
  return new Set(ranked.slice(0, limit).map((r) => r.id));
}
