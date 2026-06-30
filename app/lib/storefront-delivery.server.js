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

function stripThemeFileComments(content) {
  if (!content) return "";
  return content.replace(/^\/\*[\s\S]*?\*\/\s*/, "").trim();
}

function collectThemeBlocks(node, blocks = []) {
  if (!node || typeof node !== "object") return blocks;
  if (typeof node.type === "string") blocks.push(node);
  if (node.blocks && typeof node.blocks === "object") {
    for (const block of Object.values(node.blocks)) {
      collectThemeBlocks(block, blocks);
    }
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

function parseThemeEmbedStatus(settingsContent) {
  if (!settingsContent) {
    return { brandEmbed: false, productEmbed: false, rawFound: false };
  }

  const brandSlugs = ["brand-identity", "predictacore-brand-identity", "predictacore-brand"];
  const productSlugs = ["product-identity", "predictacore-product-identity", "predictacore-product"];
  const lower = settingsContent.toLowerCase();
  const rawFound = lower.includes("predictacore");

  const cleaned = stripThemeFileComments(settingsContent);
  try {
    const data = JSON.parse(cleaned);
    const blocks = collectThemeBlocks(data);
    const brandEmbed = blocks.some(
      (block) => isThemeBlockEnabled(block) && blockTypeMatches(block.type, brandSlugs),
    );
    const productEmbed = blocks.some(
      (block) => isThemeBlockEnabled(block) && blockTypeMatches(block.type, productSlugs),
    );
    if (brandEmbed || productEmbed) {
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
    brandEmbed: isBlockEnabled(brandSlugs),
    productEmbed: isBlockEnabled(productSlugs),
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

export async function runStorefrontDeliveryCheck(admin, shop, { sampleProduct = null, force = false } = {}) {
  const cached = await getDeliveryStatus(shop);
  if (!force && cached?.checkedAt && Date.now() - new Date(cached.checkedAt).getTime() < CACHE_MS) {
    return cached;
  }

  const storeUrl = sampleProduct?.storeUrl ?? `https://${shop}`;
  const checks = [];

  let themeEmbeds = { brandEmbed: false, productEmbed: false, rawFound: false };
  try {
    const themeRes = await admin.graphql(THEME_SETTINGS_QUERY);
    const { data } = await themeRes.json();
    const theme = data?.themes?.nodes?.[0];
    const settingsContent = theme?.files?.nodes?.[0]?.body?.content ?? "";
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

  let shopMetafields = { organization: false, llms: false };
  try {
    const mfRes = await admin.graphql(SHOP_METAFIELDS_QUERY);
    const { data } = await mfRes.json();
    shopMetafields = {
      organization: Boolean(data?.shop?.organization?.value?.trim()),
      llms: Boolean(data?.shop?.llms?.value?.trim()),
    };
    checks.push({
      id: "shop_org_metafield",
      labelKey: "deliveryShopSchema",
      ok: shopMetafields.organization,
      detail: shopMetafields.organization ? "saved" : "missing",
    });
    checks.push({
      id: "shop_llms_metafield",
      labelKey: "deliveryLlmsMetafield",
      ok: shopMetafields.llms,
      detail: shopMetafields.llms ? "saved" : "missing",
    });
  } catch {
    checks.push({ id: "shop_org_metafield", labelKey: "deliveryShopSchema", ok: false, detail: "query_failed" });
  }

  const llmsProxyUrl = `${storeUrl.replace(/\/$/, "")}/apps/predictacore/llms.txt`;
  const llmsFetch = await fetchStorefrontUrl(llmsProxyUrl);
  const llmsOk = llmsFetch.ok && llmsFetch.text.includes("#") && !llmsFetch.text.includes("<html");
  checks.push({
    id: "llms_proxy_live",
    labelKey: "deliveryLlmsLive",
    ok: llmsOk,
    detail: llmsOk ? "live" : llmsFetch.error ?? `http_${llmsFetch.status}`,
    url: llmsProxyUrl,
  });

  // Metafield is optional when the app proxy serves llms.txt live.
  const llmsMetaCheck = checks.find((c) => c.id === "shop_llms_metafield");
  if (llmsMetaCheck && !llmsMetaCheck.ok && llmsOk) {
    llmsMetaCheck.ok = true;
    llmsMetaCheck.detail = "served_via_proxy";
  }

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
      const hasProduct = hasSchemaType(ldBlocks, "Product");
      const hasOrg = hasSchemaType(ldBlocks, "Organization");
      checks.push({
        id: "live_product_jsonld",
        labelKey: "deliveryLiveProductLd",
        ok: hasProduct,
        detail: hasProduct ? "visible" : "not_in_html",
        url: productUrl,
      });
      checks.push({
        id: "live_org_jsonld",
        labelKey: "deliveryLiveOrgLd",
        ok: hasOrg,
        detail: hasOrg ? "visible" : "not_in_html",
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
    }
  }

  reconcileThemeEmbedChecks(checks);

  const passed = checks.filter((c) => c.ok).length;
  const total = checks.length;
  const crawlerReady = checks.filter((c) =>
    ["theme_brand_embed", "theme_product_embed", "live_product_jsonld", "live_org_jsonld"].includes(c.id),
  ).every((c) => c.ok);

  const report = {
    checkedAt: new Date().toISOString(),
    passed,
    total,
    crawlerReady,
    readyPct: total ? Math.round((passed / total) * 100) : 0,
    checks,
    storeUrl,
    themeEditorUrl: `https://admin.shopify.com/store/${shop.replace(".myshopify.com", "")}/themes/current/editor?context=apps`,
  };

  await saveDeliveryStatus(shop, report);
  return report;
}

export async function saveDeliveryStatus(shop, report) {
  const payload = JSON.stringify(report);
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
    return JSON.parse(row.deliveryStatusJson);
  } catch {
    return null;
  }
}
