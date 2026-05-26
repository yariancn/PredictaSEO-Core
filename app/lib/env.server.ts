const DEFAULT_SCOPES =
  "read_products,write_products,read_content,write_content,read_locales,read_markets,read_themes,write_themes,read_locations,read_metaobject_definitions,write_metaobject_definitions,read_metaobjects,write_metaobjects,read_reports";

const PRODUCTION_APP_URL =
  "https://predictaseo-core-production.up.railway.app";

// Public client id from shopify.app.toml — safe to ship as fallback
const DEFAULT_API_KEY = "08747e1aee44008f3206d0e0d4c1b130";

export function getShopifyApiKey() {
  return (
    process.env.SHOPIFY_API_KEY?.trim() ||
    process.env.SHOPIFY_CLIENT_ID?.trim() ||
    DEFAULT_API_KEY
  );
}

export function getShopifyApiSecret() {
  return (
    process.env.SHOPIFY_API_SECRET?.trim() ||
    process.env.SHOPIFY_CLIENT_SECRET?.trim() ||
    ""
  );
}

export function getShopifyAppUrl() {
  const explicit = process.env.SHOPIFY_APP_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");

  const railwayDomain = process.env.RAILWAY_PUBLIC_DOMAIN?.trim();
  if (railwayDomain) return `https://${railwayDomain}`;

  if (process.env.NODE_ENV === "production") return PRODUCTION_APP_URL;

  return "";
}

export function getShopifyScopes() {
  const raw = process.env.SCOPES?.trim() || DEFAULT_SCOPES;
  return raw
    .split(",")
    .map((scope) => scope.trim())
    .filter(Boolean);
}
