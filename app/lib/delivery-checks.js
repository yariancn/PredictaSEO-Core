/** Checks PredictaCore completes automatically on Apply (no merchant theme action). */
export const DELIVERY_AUTOMATED_IDS = new Set([
  "shop_org_metafield",
  "shop_llms_metafield",
  "product_schema_metafield",
  "llms_proxy_live",
]);

/** Optional merchant steps Shopify does not allow apps to enable programmatically. */
export const DELIVERY_RECOMMENDATION_IDS = new Set([
  "theme_brand_embed",
  "theme_product_embed",
  "live_product_jsonld",
  "live_org_jsonld",
]);

export function splitDeliveryChecks(checks = []) {
  const automated = checks.filter((c) => DELIVERY_AUTOMATED_IDS.has(c.id));
  const recommended = checks.filter((c) => DELIVERY_RECOMMENDATION_IDS.has(c.id));
  return { automated, recommended };
}

export function automatedDeliveryPct(checks = []) {
  const { automated } = splitDeliveryChecks(checks);
  if (!automated.length) return 0;
  const passed = automated.filter((c) => c.ok).length;
  return Math.round((passed / automated.length) * 100);
}
