/**
 * Category benchmark heuristics — internal readiness vs typical GEO baseline.
 * Not third-party competitive data.
 */

const TYPICAL = {
  seoTitlePct: 72,
  seoDescPct: 65,
  bodyPct: 58,
  schemaActivePct: 45,
  marketAlignedPct: 55,
};

export function buildCategoryBenchmark(executive, marketContext) {
  const factors = executive?.scoreFactors ?? [];
  const catalog = factors.filter((f) => f.group === "catalog");
  const brand = factors.filter((f) => f.group === "foundation");

  const seoTitleOk = catalog.filter((f) => f.id?.includes("title") && f.ok).length;
  const seoTitleTotal = catalog.filter((f) => f.id?.includes("title")).length || 1;
  const seoTitlePct = Math.round((seoTitleOk / seoTitleTotal) * 100);

  const yourScore = executive?.score ?? 0;
  const typicalScore = Math.round(
    (TYPICAL.seoTitlePct + TYPICAL.seoDescPct + TYPICAL.bodyPct + TYPICAL.schemaActivePct) / 4,
  );
  const delta = yourScore - typicalScore;

  const marketConfigured = Boolean(marketContext?.configured && marketContext?.countryCodes?.length);

  return {
    yourScore,
    typicalScore,
    delta,
    ahead: delta >= 10,
    behind: delta <= -10,
    marketConfigured,
    messageKey: delta >= 10 ? "benchmarkAhead" : delta <= -10 ? "benchmarkBehind" : "benchmarkOnPar",
    seoTitlePct,
  };
}
