import prisma from "../db.server.js";

const THEME_SETTINGS_QUERY = `#graphql
  query PredictaCoreThemeEmbeds {
    themes(first: 1, roles: [MAIN]) {
      nodes {
        id
        name
        role
        files(filenames: ["config/settings_data.json"]) {
          nodes {
            body {
              ... on OnlineStoreThemeFileBodyText {
                content
              }
              ... on OnlineStoreThemeFileBodyBase64 {
                contentBase64
              }
            }
          }
        }
      }
    }
  }
`;

const SHOP_METAFIELDS_QUERY = `#graphql
  query PredictaCoreShopDeliveryMetafields {
    shop {
      organization: metafield(namespace: "predictacore", key: "organization_json_ld") { value }
      llms: metafield(namespace: "predictacore", key: "llms_txt") { value }
    }
  }
`;

const PRODUCT_METAFIELD_QUERY = `#graphql
  query PredictaCoreProductDeliveryMetafield($id: ID!) {
    product(id: $id) {
      id
      handle
      metafield(namespace: "predictacore", key: "product_json_ld") { value }
    }
  }
`;

const CACHE_MS = 6 * 60 * 60 * 1000;

const BRAND_SLUGS = ["brand-identity", "predictacore-brand-identity", "predictacore-brand"];
const PRODUCT_SLUGS = ["product-identity", "predictacore-product-identity", "predictacore-product"];

function stripThemeFileComments(content) {
  if (!content) return "";
  return content.replace(/^\/\*[\s\S]*?\*\/\s*/, "").trim();
}

function readThemeFileBody(body) {
  if (!body) return "";
  if (typeof body.content === "string" && body.content.length > 0) return body.content;
  if (typeof body.contentBase64 === "string" && body.contentBase64.length > 0) {
    return Buffer.from(body.contentBase64, "base64").toString("utf8");
  }
  return "";
}

function collectThemeBlocks(node, blocks = [], depth = 0) {
  if (!node || typeof node !== "object" || depth > 14) return blocks;
  if (typeof node.type === "string") blocks.push(node);
  if (Array.isArray(node)) {
    for (const item of node) collectThemeBlocks(item, blocks, depth + 1);
    return blocks;
  }
  for (const value of Object.values(node)) {
    if (value && typeof value === "object") collectThemeBlocks(value, blocks, depth + 1);
  }
  return blocks;
}

function blockTypeMatches(type, slugs) {
  const lower = String(type).toLowerCase();
  return slugs.some((slug) => lower.includes(slug.toLowerCase()));
}

function isThemeBlockEnabled(block) {
  if (!block || block.disabled === true) return false;
  return Boolean(block.type);
}

export function parseThemeEmbedStatus(settingsContent) {
  if (!settingsContent) {
    return { brandEmbed: false, productEmbed: false, rawFound: false };
  }

  const lower = settingsContent.toLowerCase();
  const rawFound = lower.includes("predictacore");

  const cleaned = stripThemeFileComments(settingsContent);
  try {
    const data = JSON.parse(cleaned);
    const blocks = collectThemeBlocks(data);
    const brandEmbed = blocks.some(
      (block) => isThemeBlockEnabled(block) && blockTypeMatches(block.type, BRAND_SLUGS),
    );
    const productEmbed = blocks.some(
      (block) => isThemeBlockEnabled(block) && blockTypeMatches(block.type, PRODUCT_SLUGS),
    );
    if (brandEmbed || productEmbed || rawFound) {
      return { brandEmbed, productEmbed, rawFound: true };
    }
  } catch {
    /* fall through to string heuristics */
  }

  const isBlockEnabled = (slugs) => {
    for (const slug of slugs) {
      const needle = slug.toLowerCase();
      if (!lower.includes(needle)) continue;
      let idx = 0;
      while (idx < lower.length) {
        const at = lower.indexOf(needle, idx);
        if (at < 0) break;
        const windowText = settingsContent.slice(Math.max(0, at - 250), at + 450);
        if (!/["']disabled["']\s*:\s*true/i.test(windowText)) return true;
        idx = at + needle.length;
      }
    }
    return false;
  };

  return {
    brandEmbed: isBlockEnabled(BRAND_SLUGS),
    productEmbed: isBlockEnabled(PRODUCT_SLUGS),
    rawFound,
  };
}

function reconcileThemeEmbedChecks(checks) {
  const byId = Object.fromEntries(checks.map((c) => [c.id, c]));
  const liveOrg = byId.live_org_jsonld;
  const liveProduct = byId.live_product_jsonld;
  const brand = byId.theme_brand_embed;
  const product = byId.theme_product_embed;

  if (brand && !brand.ok && liveOrg?.ok) {
    brand.ok = true;
    brand.detail = "confirmed_live_html";
  }
  if (product && !product.ok && liveProduct?.ok) {
    product.ok = true;
    product.detail = "confirmed_live_html";
  }
}

function reconcileLlmsChecks(checks) {
  const llmsMeta = checks.find((c) => c.id === "shop_llms_metafield");
  const llmsProxy = checks.find((c) => c.id === "llms_proxy_live");
  if (llmsMeta && !llmsMeta.ok && llmsProxy?.ok) {
    llmsMeta.ok = true;
    llmsMeta.detail = "served_via_proxy";
  }
}

export function normalizeDeliveryReport(report) {
  if (!report?.checks?.length) return report;
  const checks = report.checks.map((c) => ({ ...c }));
  reconcileThemeEmbedChecks(checks);
  reconcileLlmsChecks(checks);
  const passed = checks.filter((c) => c.ok).length;
  const total = checks.length;
  const crawlerReady = checks
    .filter((c) =>
      ["theme_brand_embed", "theme_product_embed", "live_product_jsonld", "live_org_jsonld"].includes(c.id),
    )
    .every((c) => c.ok);
  return {
    ...report,
    checks,
    passed,
    total,
    crawlerReady,
    readyPct: total ? Math.round((passed / total) * 100) : 0,
  };
}

export function deliveryNeedsRefresh(status, { force = false } = {}) {
  if (force) return true;
  if (!status?.checkedAt) return true;
  if (Date.now() - new Date(status.checkedAt).getTime() > CACHE_MS) return true;
  const byId = Object.fromEntries((status.checks ?? []).map((c) => [c.id, c]));
  if (byId.live_org_jsonld?.ok && !byId.theme_brand_embed?.ok) return true;
  if (byId.live_product_jsonld?.ok && !byId.theme_product_embed?.ok) return true;
  if (byId.llms_proxy_live?.ok && !byId.shop_llms_metafield?.ok) return true;
  return false;
}

function extractJsonLdBlocks(html) {
  const blocks = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = re.exec(html))) {
    try {
      blocks.push(JSON.parse(match[1]));
    } catch {
      /* skip malformed */
    }
  }
  return blocks;
}

async function fetchStorefrontUrl(url, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "PredictaCore-DeliveryCheck/1.0",
        Accept: "text/html,text/plain,*/*",
      },
      redirect: "follow",
    });
    const text = await res.text();
    return { ok: res.ok, status: res.status, text, url: res.url };
  } catch (err) {
    return { ok: false, status: 0, text: "", error: err.message ?? "fetch_failed", url };
  } finally {
    clearTimeout(timer);
  }
}

function isLlmsTextOk(text) {
  if (!text || text.includes("<html")) return false;
  const trimmed = text.trim();
  return trimmed.startsWith("#") || trimmed.toLowerCase().includes("llms");
}

async function fetchLlmsProxy(storeUrl, shop) {
  const candidates = [];
  const add = (base) => {
    const clean = String(base ?? "").replace(/\/$/, "");
    if (!clean) return;
    const url = `${clean}/apps/predictacore/llms.txt`;
    if (!candidates.includes(url)) candidates.push(url);
  };

  add(storeUrl);
  add(`https://${shop}`);

  let last = { ok: false, status: 0, text: "", url: candidates[0] ?? "" };
  for (const url of candidates) {
    const result = await fetchStorefrontUrl(url);
    last = result;
    if (result.ok && isLlmsTextOk(result.text)) {
      return { ...result, ok: true };
    }
  }
  return last;
}

function hasSchemaType(blocks, type) {
  const walk = (node) => {
    if (!node || typeof node !== "object") return false;
    if (node["@type"] === type || (Array.isArray(node["@type"]) && node["@type"].includes(type))) {
      return true;
    }
    if (Array.isArray(node)) return node.some(walk);
    return Object.values(node).some((v) => (Array.isArray(v) ? v.some(walk) : walk(v)));
  };
  return blocks.some(walk);
}

function buildDeliveryReport({ checks, storeUrl, shop }) {
  reconcileThemeEmbedChecks(checks);
  reconcileLlmsChecks(checks);
  const passed = checks.filter((c) => c.ok).length;
  const total = checks.length;
  const crawlerReady = checks
    .filter((c) =>
      ["theme_brand_embed", "theme_product_embed", "live_product_jsonld", "live_org_jsonld"].includes(c.id),
    )
    .every((c) => c.ok);

  return {
    checkedAt: new Date().toISOString(),
    passed,
    total,
    crawlerReady,
    readyPct: total ? Math.round((passed / total) * 100) : 0,
    checks,
    storeUrl,
    themeEditorUrl: `https://admin.shopify.com/store/${shop.replace(".myshopify.com", "")}/themes/current/editor?context=apps`,
  };
}

export async function runStorefrontDeliveryCheck(admin, shop, { sampleProduct = null, force = false } = {}) {
  const cached = await getDeliveryStatus(shop);
  const normalizedCache = cached ? normalizeDeliveryReport(cached) : null;
  if (!force && normalizedCache?.checkedAt && !deliveryNeedsRefresh(normalizedCache, { force: false })) {
    return normalizedCache;
  }

  const storeUrl = sampleProduct?.storeUrl ?? `https://${shop}`;
  const checks = [];

  let themeEmbeds = { brandEmbed: false, productEmbed: false, rawFound: false };
  try {
    const themeRes = await admin.graphql(THEME_SETTINGS_QUERY);
    const { data } = await themeRes.json();
    const theme = data?.themes?.nodes?.[0];
    const settingsContent = readThemeFileBody(theme?.files?.nodes?.[0]?.body);
    themeEmbeds = parseThemeEmbedStatus(settingsContent);
    checks.push({
      id: "theme_brand_embed",
      labelKey: "deliveryThemeBrand",
      ok: themeEmbeds.brandEmbed,
      detail: themeEmbeds.brandEmbed ? "enabled" : themeEmbeds.rawFound ? "found_not_enabled" : "missing",
    });
    checks.push({
      id: "theme_product_embed",
      labelKey: "deliveryThemeProduct",
      ok: themeEmbeds.productEmbed,
      detail: themeEmbeds.productEmbed ? "enabled" : themeEmbeds.rawFound ? "found_not_enabled" : "missing",
    });
  } catch {
    checks.push({ id: "theme_brand_embed", labelKey: "deliveryThemeBrand", ok: false, detail: "query_failed" });
    checks.push({ id: "theme_product_embed", labelKey: "deliveryThemeProduct", ok: false, detail: "query_failed" });
  }

  try {
    const mfRes = await admin.graphql(SHOP_METAFIELDS_QUERY);
    const { data } = await mfRes.json();
    let llmsSaved = Boolean(data?.shop?.llms?.value?.trim());
    if (!llmsSaved) {
      try {
        const { CATALOG_QUERY } = await import("./diagnostic.server.js");
        const { buildMarketContext } = await import("./markets.server.js");
        const { getShopMarketSettings } = await import("./shop-market.server.js");
        const { saveLlmsTxtMetafield } = await import("./validation.server.js");
        const catalogRes = await admin.graphql(CATALOG_QUERY);
        const catalogJson = await catalogRes.json();
        const overrides = await getShopMarketSettings(shop);
        const marketContext = buildMarketContext(catalogJson.data, overrides);
        llmsSaved = await saveLlmsTxtMetafield(admin, catalogJson.data?.shop, marketContext);
      } catch {
        llmsSaved = false;
      }
    }
    checks.push({
      id: "shop_org_metafield",
      labelKey: "deliveryShopSchema",
      ok: Boolean(data?.shop?.organization?.value?.trim()),
      detail: data?.shop?.organization?.value?.trim() ? "saved" : "missing",
    });
    checks.push({
      id: "shop_llms_metafield",
      labelKey: "deliveryLlmsMetafield",
      ok: llmsSaved || Boolean(data?.shop?.llms?.value?.trim()),
      detail: llmsSaved || data?.shop?.llms?.value?.trim() ? "saved" : "missing",
    });
  } catch {
    checks.push({ id: "shop_org_metafield", labelKey: "deliveryShopSchema", ok: false, detail: "query_failed" });
    checks.push({ id: "shop_llms_metafield", labelKey: "deliveryLlmsMetafield", ok: false, detail: "query_failed" });
  }

  const llmsFetch = await fetchLlmsProxy(storeUrl, shop);
  const llmsOk = llmsFetch.ok && isLlmsTextOk(llmsFetch.text);
  checks.push({
    id: "llms_proxy_live",
    labelKey: "deliveryLlmsLive",
    ok: llmsOk,
    detail: llmsOk ? "live" : llmsFetch.error ?? `http_${llmsFetch.status}`,
    url: llmsFetch.url,
  });

  if (sampleProduct?.id) {
    try {
      const pRes = await admin.graphql(PRODUCT_METAFIELD_QUERY, { variables: { id: sampleProduct.id } });
      const { data } = await pRes.json();
      const hasProductLd = Boolean(data?.product?.metafield?.value?.trim());
      checks.push({
        id: "product_schema_metafield",
        labelKey: "deliveryProductSchema",
        ok: hasProductLd,
        detail: hasProductLd ? "saved" : "missing",
      });
    } catch {
      checks.push({ id: "product_schema_metafield", labelKey: "deliveryProductSchema", ok: false, detail: "query_failed" });
    }
  }

  if (sampleProduct?.handle) {
    const productUrl = `${storeUrl.replace(/\/$/, "")}/products/${sampleProduct.handle}`;
    const pageFetch = await fetchStorefrontUrl(productUrl);
    if (pageFetch.ok) {
      const ldBlocks = extractJsonLdBlocks(pageFetch.text);
      checks.push({
        id: "live_product_jsonld",
        labelKey: "deliveryLiveProductLd",
        ok: hasSchemaType(ldBlocks, "Product"),
        detail: hasSchemaType(ldBlocks, "Product") ? "visible" : "not_in_html",
        url: productUrl,
      });
      checks.push({
        id: "live_org_jsonld",
        labelKey: "deliveryLiveOrgLd",
        ok: hasSchemaType(ldBlocks, "Organization"),
        detail: hasSchemaType(ldBlocks, "Organization") ? "visible" : "not_in_html",
        url: storeUrl,
      });
    } else {
      checks.push({
        id: "live_product_jsonld",
        labelKey: "deliveryLiveProductLd",
        ok: false,
        detail: pageFetch.error ?? `http_${pageFetch.status}`,
        url: productUrl,
      });
      checks.push({
        id: "live_org_jsonld",
        labelKey: "deliveryLiveOrgLd",
        ok: false,
        detail: pageFetch.error ?? `http_${pageFetch.status}`,
        url: storeUrl,
      });
    }
  }

  const report = buildDeliveryReport({ checks, storeUrl, shop });
  await saveDeliveryStatus(shop, report);
  return report;
}

export async function saveDeliveryStatus(shop, report) {
  const payload = JSON.stringify(normalizeDeliveryReport(report));
  await prisma.shopSettings.upsert({
    where: { shop },
    create: { shop, deliveryStatusJson: payload },
    update: { deliveryStatusJson: payload },
  });
}

export async function getDeliveryStatus(shop) {
  const row = await prisma.shopSettings.findUnique({ where: { shop } });
  if (!row?.deliveryStatusJson) return null;
  try {
    return normalizeDeliveryReport(JSON.parse(row.deliveryStatusJson));
  } catch {
    return null;
  }
}
