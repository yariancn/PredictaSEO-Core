import { detectGeoMismatch } from "./markets.server.js";

const WEIGHTS = {
  marketAlignment: 0.25,
  catalogCompleteness: 0.25,
  brandEntity: 0.2,
  semanticRichness: 0.15,
  commercialSignals: 0.15,
};

function pct(items, predicate) {
  if (!items.length) return 100;
  return Math.round((items.filter(predicate).length / items.length) * 100);
}

function hasSeoTitle(p) {
  return (p.seo?.title ?? "").trim().length >= 10;
}

function hasSeoDesc(p) {
  return (p.seo?.description ?? "").trim().length >= 50;
}

function hasBodyDesc(p) {
  const html = p.descriptionHtml ?? p.description ?? "";
  return String(html).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().length >= 40;
}

function hasTags(p) {
  return (p.tags ?? []).length > 0;
}

function marketAlignmentScore(priorityProducts, marketContext, schemaActive) {
  if (!marketContext?.configured) return 25;
  let points = marketContext.confirmed ? 40 : 25;
  if (marketContext.countryCodes.length > 0) points += 20;

  const sample = priorityProducts.slice(0, 20);
  const mismatches = sample.filter((p) => {
    const seoBlob = `${p.seo?.title ?? ""} ${p.seo?.description ?? ""}`;
    return detectGeoMismatch(seoBlob, marketContext.countryCodes);
  }).length;

  if (sample.length > 0) {
    const alignedPct = 1 - mismatches / sample.length;
    points += Math.round(alignedPct * 25);
  }

  if (schemaActive && marketContext.countryCodes.length > 0) points += 15;
  return Math.min(100, points);
}

function catalogCompletenessScore(products) {
  const titlePct = pct(products, hasSeoTitle);
  const descPct = pct(products, hasSeoDesc);
  const bodyPct = pct(products, hasBodyDesc);
  return Math.round((titlePct + descPct + bodyPct) / 3);
}

function semanticRichnessScore(products) {
  const tagPct = pct(products, hasTags);
  const bodyPct = pct(products, hasBodyDesc);
  const typedPct = pct(products, (p) => Boolean((p.productType ?? "").trim()));
  return Math.round(tagPct * 0.3 + bodyPct * 0.45 + typedPct * 0.25);
}

function commercialSignalsScore(products, salesRanking) {
  if (!salesRanking?.byId?.size) return 55;
  const withSales = products.filter((p) => (salesRanking.byId.get(p.id)?.orders ?? 0) > 0).length;
  const ratio = products.length ? withSales / products.length : 0;
  return Math.round(40 + ratio * 60);
}

function weightedScore(factors) {
  let total = 0;
  for (const [key, weight] of Object.entries(WEIGHTS)) {
    total += (factors[key]?.score ?? 0) * weight;
  }
  return Math.round(total);
}

function projectRange(current, projected) {
  const gain = Math.max(0, projected - current);
  if (gain < 3) {
    return { low: current, high: Math.min(current + 5, 100), expected: current };
  }
  const low = Math.min(Math.round(current + gain * 0.55), 95);
  const high = Math.min(Math.round(current + gain * 0.92), 98);
  const expected = Math.round(current + gain * 0.75);
  return {
    low: Math.max(low, current + 4),
    high: Math.max(high, low + 3),
    expected: Math.min(expected, high),
  };
}

/**
 * Probabilistic AI-readiness model (internal heuristic — not a guaranteed ranking).
 */
export function computeProbabilisticScore({
  priorityProducts = [],
  marketContext,
  schemaActive = false,
  schemaPending = false,
  previewItems = [],
  salesRanking = null,
}) {
  const factors = {
    marketAlignment: {
      id: "marketAlignment",
      labelKey: "factorMarketAlignment",
      weight: WEIGHTS.marketAlignment,
      score: marketAlignmentScore(priorityProducts, marketContext, schemaActive),
    },
    catalogCompleteness: {
      id: "catalogCompleteness",
      labelKey: "factorCatalogCompleteness",
      weight: WEIGHTS.catalogCompleteness,
      score: catalogCompletenessScore(priorityProducts),
    },
    brandEntity: {
      id: "brandEntity",
      labelKey: "factorBrandEntity",
      weight: WEIGHTS.brandEntity,
      score: schemaActive ? 100 : schemaPending ? 70 : 0,
    },
    semanticRichness: {
      id: "semanticRichness",
      labelKey: "factorSemanticRichness",
      weight: WEIGHTS.semanticRichness,
      score: semanticRichnessScore(priorityProducts),
    },
    commercialSignals: {
      id: "commercialSignals",
      labelKey: "factorCommercialSignals",
      weight: WEIGHTS.commercialSignals,
      score: commercialSignalsScore(priorityProducts, salesRanking),
    },
  };

  const score = weightedScore(factors);

  const simulatedProducts = simulateProductsAfterPreview(priorityProducts, previewItems);
  const projectedFactors = {
    ...factors,
    marketAlignment: {
      ...factors.marketAlignment,
      score: marketAlignmentScore(simulatedProducts, marketContext, schemaPending || schemaActive),
    },
    catalogCompleteness: {
      ...factors.catalogCompleteness,
      score: catalogCompletenessScore(simulatedProducts),
    },
    brandEntity: {
      ...factors.brandEntity,
      score: schemaPending || schemaActive ? 100 : 0,
    },
    semanticRichness: {
      ...factors.semanticRichness,
      score: semanticRichnessScore(simulatedProducts),
    },
  };

  const scoreAfterApply = weightedScore(projectedFactors);
  const projection = projectRange(score, scoreAfterApply);

  const gapFactors = Object.values(factors).filter((f) => f.score < 85);
  const gapsClosed = Object.values(projectedFactors).filter((f, i) => {
    const before = Object.values(factors)[i];
    return before.score < 85 && f.score >= 85;
  }).length;

  return {
    score,
    scoreAfterApply: projection.expected,
    projection,
    factors: Object.values(factors),
    projectedFactors: Object.values(projectedFactors),
    gapCount: gapFactors.length,
    gapsClosedIfApplied: gapsClosed,
    confidenceLabelKey:
      projection.expected - score >= 15 ? "scoreConfidenceHigh" : "scoreConfidenceModerate",
  };
}

function simulateProductsAfterPreview(products, previewItems) {
  const titleFixed = new Set(previewItems.filter((i) => i.changes?.seoTitle).map((i) => i.id));
  const seoDescFixed = new Set(previewItems.filter((i) => i.changes?.seoDescription).map((i) => i.id));
  const bodyFixed = new Set(previewItems.filter((i) => i.changes?.descriptionHtml).map((i) => i.id));

  return products.map((p) => {
    const item = previewItems.find((i) => i.id === p.id);
    return {
      ...p,
      seo: {
        title: titleFixed.has(p.id) ? item?.changes?.seoTitle ?? p.seo?.title : p.seo?.title,
        description: seoDescFixed.has(p.id)
          ? item?.changes?.seoDescription ?? p.seo?.description
          : p.seo?.description,
      },
      descriptionHtml: bodyFixed.has(p.id)
        ? item?.changes?.descriptionHtml ?? p.descriptionHtml
        : p.descriptionHtml,
      tags: p.tags?.length ? p.tags : item ? ["optimized"] : p.tags,
    };
  });
}

/** Legacy bridge — keep executive.score in sync with probabilistic expected value. */
export function attachProbabilisticToExecutive(executive, probabilistic) {
  if (!probabilistic) return executive;
  return {
    ...executive,
    score: probabilistic.score,
    scoreAfterApply: probabilistic.projection.expected,
    scoreProjection: probabilistic.projection,
    probabilistic,
  };
}
