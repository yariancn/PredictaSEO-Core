import { enrichCatalogWithSalesProducts, fetchSalesRanking } from "./sales-ranking.server.js";

export const PRIORITY_LIMIT = 50;

const BEST_SELLER_PATTERN =
  /best\s*sell|bestsell|top\s*sell|m[aá]s\s*vendid|mejores\s*ventas|plus\s*vend/i;

const PRODUCT_FIELDS = `
  id
  title
  handle
  description
  descriptionHtml
  productType
  vendor
  tags
  status
  publishedAt
  totalInventory
  hasOutOfStockVariants
  isGiftCard
  seo { title description }
`;

export const CATALOG_QUERY = `#graphql
  query PredictaCoreCatalog {
    shop {
      name
      email
      myshopifyDomain
      currencyCode
      primaryDomain { url host }
      billingAddress { country city province }
      plan { displayName }
    }
    productsCount { count }
    bestSellerCollections: collections(first: 20, sortKey: UPDATED_AT, reverse: true) {
      nodes {
        id
        handle
        title
        productsCount { count }
        products(first: ${PRIORITY_LIMIT}) {
          nodes { ${PRODUCT_FIELDS} }
        }
      }
    }
    catalogPool: products(
      first: 150
      sortKey: PUBLISHED_AT
      reverse: true
      query: "status:ACTIVE published_status:published"
    ) {
      nodes { ${PRODUCT_FIELDS} }
    }
    markets(first: 10) {
      nodes { name enabled primary }
    }
    shopLocales {
      locale name primary published
    }
    locations(first: 10) {
      nodes {
        name
        isActive
        address { city country province }
      }
    }
    pages(first: 10) {
      nodes { title handle bodySummary }
    }
    collections(first: 25) {
      nodes {
        id
        title
        handle
        productsCount { count }
      }
    }
  }
`;

export function isCommerciallySellable(product) {
  if (!product || product.isGiftCard || product.status !== "ACTIVE" || !product.publishedAt) {
    return false;
  }

  const title = (product?.title ?? "").toLowerCase();
  if (title.includes("gift card") || title.includes("giftcard")) return false;

  const inventory = product?.totalInventory ?? 0;
  if (inventory <= 0 && product.hasOutOfStockVariants === true) return false;

  return true;
}

export function scoreCommercial(product) {
  if (!isCommerciallySellable(product)) return -100;

  let score = 0;
  score += 35;
  score += 15;

  const inventory = product?.totalInventory ?? 0;
  if (inventory > 20) score += 30;
  else if (inventory > 0) score += 20;
  else if (product?.hasOutOfStockVariants === false) score += 15;

  return score;
}

function findBestSellersCollection(collections = []) {
  const matches = collections.filter(
    (c) =>
      BEST_SELLER_PATTERN.test(c.title ?? "") ||
      BEST_SELLER_PATTERN.test(c.handle ?? ""),
  );
  if (matches.length === 0) return null;
  return matches.sort(
    (a, b) => (b.productsCount?.count ?? 0) - (a.productsCount?.count ?? 0),
  )[0];
}

function dedupeProducts(products) {
  const seen = new Set();
  const out = [];
  for (const product of products) {
    if (!product?.id || seen.has(product.id)) continue;
    seen.add(product.id);
    out.push(product);
  }
  return out;
}

export function selectTopCommercialProducts(rawData, limit = PRIORITY_LIMIT, salesRanking = null) {
  const collectionsWithProducts = rawData?.bestSellerCollections?.nodes ?? [];
  const bestCollection = findBestSellersCollection(collectionsWithProducts);
  const pool = rawData?.catalogPool?.nodes ?? [];

  let source = "commercial_ranking";
  let sourceLabelKey = "selectionFromRanking";
  let candidates = [];

  if (bestCollection?.products?.nodes?.length) {
    candidates = dedupeProducts(bestCollection.products.nodes);
  }

  candidates = dedupeProducts([...candidates, ...pool]);

  const activeCandidates = candidates.filter(isCommerciallySellable);

  if (salesRanking?.byId?.size >= 5) {
    const ranked = activeCandidates
      .map((product) => ({
        product,
        sales: salesRanking.byId.get(product.id) ?? null,
        commercialScore: scoreCommercial(product),
      }))
      .sort((a, b) => {
        const aOrders = a.sales?.orders ?? 0;
        const bOrders = b.sales?.orders ?? 0;
        if (bOrders !== aOrders) return bOrders - aOrders;

        const aSales = a.sales?.totalSales ?? 0;
        const bSales = b.sales?.totalSales ?? 0;
        if (bSales !== aSales) return bSales - aSales;

        return b.commercialScore - a.commercialScore;
      })
      .slice(0, limit)
      .map((row) => row.product);

    if (ranked.length > 0) {
      return {
        products: ranked,
        meta: {
          source: "sales_analytics",
          sourceLabelKey: "selectionFromSales",
          collectionTitle: bestCollection?.title ?? null,
          poolSize: pool.length,
          selectedCount: ranked.length,
          salesCount: salesRanking.count,
          salesLookbackDays: 90,
        },
      };
    }
  }

  if (bestCollection?.products?.nodes?.length && candidates.length >= Math.min(10, limit)) {
    source = "best_sellers_collection";
    sourceLabelKey = "selectionFromBestSellers";
  }

  const ranked = activeCandidates
    .map((product) => ({ product, commercialScore: scoreCommercial(product) }))
    .filter((row) => row.commercialScore > 0)
    .sort((a, b) => b.commercialScore - a.commercialScore)
    .slice(0, limit)
    .map((row) => row.product);

  const products =
    ranked.length > 0
      ? ranked
      : dedupeProducts(pool.filter(isCommerciallySellable)).slice(0, limit);

  return {
    products,
    meta: {
      source,
      sourceLabelKey,
      collectionTitle: bestCollection?.title ?? null,
      poolSize: pool.length,
      selectedCount: products.length,
    },
  };
}

export async function prepareCatalogData(admin, rawData) {
  const salesRanking = admin ? await fetchSalesRanking(admin) : null;
  const enrichedData = admin
    ? await enrichCatalogWithSalesProducts(admin, rawData, salesRanking)
    : rawData;
  const selection = selectTopCommercialProducts(enrichedData, PRIORITY_LIMIT, salesRanking);
  return {
    ...enrichedData,
    products: { nodes: selection.products },
    catalogSelection: selection.meta,
  };
}

function stripHtml(html) {
  return (html ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function coveragePct(products, predicate) {
  if (products.length === 0) return 100;
  return Math.round((products.filter(predicate).length / products.length) * 100);
}

function countMissing(products, predicate) {
  return products.filter((p) => !predicate(p)).length;
}

function hasSeoTitle(p) {
  return (p.seo?.title ?? "").trim().length >= 10;
}

function hasSeoDesc(p) {
  return (p.seo?.description ?? "").trim().length >= 50;
}

function hasBodyDesc(p) {
  return stripHtml(p.descriptionHtml ?? p.description).length >= 40;
}

export function scoreProduct(product, locale = "en") {
  const tr = (key) => translate(locale, key);
  let score = 0;
  const reasons = [];
  const title = (product.title || "").toLowerCase();

  if (!hasSeoTitle(product)) {
    score += 30;
    reasons.push(tr("reasonNoSeoTitle"));
  }
  if (!hasSeoDesc(product)) {
    score += 25;
    reasons.push(tr("reasonNoSeoDesc"));
  }
  if (!hasBodyDesc(product)) {
    score += 20;
    reasons.push(tr("reasonNoDesc"));
  }
  if (title.includes("gift")) {
    score -= 10;
    reasons.push(tr("reasonGiftCard"));
  }
  if ((product.tags || []).length === 0) {
    score += 5;
    reasons.push(tr("reasonNoTags"));
  }

  const viability = score >= 60 ? "ALTA" : score >= 35 ? "MEDIA" : "BAJA";
  return { score, reasons, viability };
}

export function buildProductMatrix(products, locale = "en") {
  return products
    .map((p) => ({ product: p, ...scoreProduct(p, locale) }))
    .sort((a, b) => b.score - a.score);
}

export function getPriorityProducts(products, matrix) {
  const ordered = [];
  const seen = new Set();
  for (const row of matrix) {
    if (seen.has(row.product.id)) continue;
    seen.add(row.product.id);
    ordered.push(row.product);
    if (ordered.length >= PRIORITY_LIMIT) return ordered;
  }
  for (const product of products) {
    if (seen.has(product.id)) continue;
    seen.add(product.id);
    ordered.push(product);
    if (ordered.length >= PRIORITY_LIMIT) return ordered;
  }
  return ordered;
}

export function computeOverallScore(seoTitlePct, seoDescPct, descPct, schemaActive) {
  const foundationScore = schemaActive ? 100 : 0;
  return Math.round((seoTitlePct + seoDescPct + descPct + foundationScore) / 4);
}

function computeCatalogFactors(products) {
  const seoTitlePct = coveragePct(products, hasSeoTitle);
  const seoDescPct = coveragePct(products, hasSeoDesc);
  const descPct = coveragePct(products, hasBodyDesc);
  const catalogScore = Math.round((seoTitlePct + seoDescPct + descPct) / 3);
  return { seoTitlePct, seoDescPct, descPct, catalogScore };
}

export function simulateScoreAfterApply(priorityProducts, previewItems, schemaWillApply) {
  const titleFixed = new Set(
    previewItems.filter((i) => i.changes?.seoTitle).map((i) => i.id),
  );
  const seoDescFixed = new Set(
    previewItems.filter((i) => i.changes?.seoDescription).map((i) => i.id),
  );
  const bodyFixed = new Set(
    previewItems.filter((i) => i.changes?.descriptionHtml).map((i) => i.id),
  );

  const simulated = priorityProducts.map((p) => {
    const item = previewItems.find((i) => i.id === p.id);
    return {
      ...p,
      seo: {
        title: titleFixed.has(p.id)
          ? item?.changes?.seoTitle ?? p.seo?.title
          : p.seo?.title,
        description: seoDescFixed.has(p.id)
          ? item?.changes?.seoDescription ?? p.seo?.description
          : p.seo?.description,
      },
      descriptionHtml: bodyFixed.has(p.id)
        ? item?.changes?.descriptionHtml ?? p.descriptionHtml ?? p.description
        : p.descriptionHtml ?? p.description,
    };
  });

  const { seoTitlePct, seoDescPct, descPct } = computeCatalogFactors(simulated);
  return computeOverallScore(seoTitlePct, seoDescPct, descPct, schemaWillApply);
}

export function analyzeExecutive(data, locale = "en", options = {}) {
  const tr = (key, vars) => translate(locale, key, vars);
  const allProducts = data?.products?.nodes ?? [];
  const markets = data?.markets?.nodes ?? [];
  const locations = data?.locations?.nodes ?? [];
  const pages = data?.pages?.nodes ?? [];
  const matrix = buildProductMatrix(allProducts, locale);
  const priorityProducts = getPriorityProducts(allProducts, matrix);
  const catalogTotal = data?.productsCount?.count ?? allProducts.length;
  const enabledMarkets = markets.filter((m) => m.enabled).length;
  const activeLocations = locations.filter((l) => l.isActive).length;

  const schemaActive = options.schemaActive ?? false;
  const schemaPending = options.schemaPending ?? false;
  const previewItems = options.previewItems ?? [];

  const { seoTitlePct, seoDescPct, descPct, catalogScore } = computeCatalogFactors(priorityProducts);
  const foundationScore = schemaActive ? 100 : 0;
  const score = computeOverallScore(seoTitlePct, seoDescPct, descPct, schemaActive);
  const scoreAfterApply = simulateScoreAfterApply(
    priorityProducts,
    previewItems,
    schemaPending || schemaActive,
  );

  const total = priorityProducts.length;
  const scoreFactors = [
    {
      id: "seoTitle",
      group: "catalog",
      ok: seoTitlePct === 100,
      pct: seoTitlePct,
      label:
        seoTitlePct === 100
          ? tr("factorSeoTitleDone")
          : tr("factorSeoTitle", {
              missing: countMissing(priorityProducts, hasSeoTitle),
              total,
            }),
    },
    {
      id: "seoDesc",
      group: "catalog",
      ok: seoDescPct === 100,
      pct: seoDescPct,
      label:
        seoDescPct === 100
          ? tr("factorSeoDescDone")
          : tr("factorSeoDesc", {
              missing: countMissing(priorityProducts, hasSeoDesc),
              total,
            }),
    },
    {
      id: "description",
      group: "catalog",
      ok: descPct === 100,
      pct: descPct,
      label:
        descPct === 100
          ? tr("factorDescDone")
          : tr("factorDesc", {
              missing: countMissing(priorityProducts, hasBodyDesc),
              total,
            }),
    },
    {
      id: "schema",
      group: "foundation",
      ok: schemaActive,
      pct: foundationScore,
      label: schemaActive ? tr("factorSchemaDone") : tr("factorSchema"),
    },
  ];

  const gaps = scoreFactors.filter((f) => !f.ok).map((f) => f.label);

  return {
    priorityLimit: PRIORITY_LIMIT,
    catalogTotal,
    priorityCount: total,
    catalogScore,
    foundationScore,
    score,
    scoreAfterApply,
    scoreFactors,
    gaps: gaps.slice(0, 5),
    productCount: total,
    marketCount: enabledMarkets,
    locationCount: activeLocations,
    pageCount: pages.length,
    priorityProducts,
    sampleProducts: priorityProducts.slice(0, 3),
    factors: {
      seoTitle: seoTitlePct,
      seoDescription: seoDescPct,
      productDescription: descPct,
      schema: foundationScore,
    },
  };
}

export function analyzeSnapshot(data, locale = "en") {
  const products = data?.products?.nodes ?? [];
  const markets = (data?.markets?.nodes ?? []).filter((m) => m.enabled);
  const locales = (data?.shopLocales ?? []).filter((l) => l.published);
  const catalogTotal = data?.productsCount?.count ?? products.length;
  const matrix = buildProductMatrix(products, locale);
  const priorityProducts = getPriorityProducts(products, matrix);
  const highPriority = matrix.filter((r) => r.viability === "ALTA").length;
  const mediumPriority = matrix.filter((r) => r.viability === "MEDIA").length;
  const selection = data?.catalogSelection ?? {};

  return {
    shop: data.shop,
    markets,
    locales,
    matrix,
    summary: {
      total: products.length,
      catalogTotal,
      priorityCount: priorityProducts.length,
      priorityLimit: PRIORITY_LIMIT,
      highPriority,
      mediumPriority,
      selectionSource: selection.source,
      selectionLabelKey: selection.sourceLabelKey,
      selectionCollection: selection.collectionTitle,
      marketsLabel: markets.map((m) => `${m.name}${m.primary ? " ★" : ""}`).join(", "),
      localesLabel: locales.map((l) => l.name).join(", "),
    },
  };
}
