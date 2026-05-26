import { t as translate } from "./locale.js";
import { inferProductCategory } from "./forense.server.js";

export const PRIORITY_LIMIT = 50;

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
    products(first: 50, sortKey: UPDATED_AT, reverse: true) {
      nodes {
        id
        title
        handle
        description
        descriptionHtml
        productType
        vendor
        tags
        seo { title description }
      }
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

export function scoreProduct(product) {
  let score = 0;
  const reasons = [];
  const title = (product.title || "").toLowerCase();

  if (!hasSeoTitle(product)) {
    score += 30;
    reasons.push("Sin SEO title");
  }
  if (!hasSeoDesc(product)) {
    score += 25;
    reasons.push("Sin SEO description");
  }
  if (!hasBodyDesc(product)) {
    score += 20;
    reasons.push("Sin descripción");
  }
  if (title.includes("snowboard") && !title.includes("gift")) {
    score += 15;
    reasons.push("Catálogo core — snowboard");
  }
  if (title.includes("gift")) {
    score -= 10;
    reasons.push("Prioridad baja — gift card");
  }
  if ((product.tags || []).length === 0) {
    score += 5;
    reasons.push("Sin tags semánticos");
  }

  const viability = score >= 60 ? "ALTA" : score >= 35 ? "MEDIA" : "BAJA";
  return { score, reasons, viability };
}

export function buildProductMatrix(products) {
  return products
    .map((p) => ({ product: p, ...scoreProduct(p) }))
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
  const matrix = buildProductMatrix(allProducts);
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

export function analyzeSnapshot(data) {
  const products = data?.products?.nodes ?? [];
  const markets = (data?.markets?.nodes ?? []).filter((m) => m.enabled);
  const locales = (data?.shopLocales ?? []).filter((l) => l.published);
  const catalogTotal = data?.productsCount?.count ?? products.length;
  const matrix = buildProductMatrix(products);
  const priorityProducts = getPriorityProducts(products, matrix);
  const highPriority = matrix.filter((r) => r.viability === "ALTA").length;
  const mediumPriority = matrix.filter((r) => r.viability === "MEDIA").length;

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
      marketsLabel: markets.map((m) => `${m.name}${m.primary ? " ★" : ""}`).join(", "),
      localesLabel: locales.map((l) => l.name).join(", "),
    },
  };
}
