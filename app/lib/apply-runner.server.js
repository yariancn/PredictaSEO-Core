import { CATALOG_QUERY, analyzeExecutive, analyzeSnapshot, getPriorityProducts, prepareCatalogData } from "./diagnostic.server.js";
import { buildOrganizationJsonLd, groupProductsByCategory } from "./forense.server.js";
import { buildPreviewPlan, applyPreviewPlan, buildAppliedItemsFromPreview } from "./apply.server.js";
import { getSchemaStatus } from "./schema.server.js";
import { getStoreLocale } from "./locale.js";
import { buildMarketContext } from "./markets.server.js";
import { getShopMarketSettings } from "./shop-market.server.js";
import { computeProbabilisticScore, attachProbabilisticToExecutive } from "./score-probability.server.js";
import { buildValidationReport } from "./validation.server.js";
import {
  APPLY_KIND,
  APPLY_STATUS,
  consumeExtraApplyCredit,
  recordApplyRun,
} from "./apply-quota.server.js";

export async function buildApplyContext(admin, shop) {
  const response = await admin.graphql(CATALOG_QUERY);
  const { data, errors } = await response.json();
  if (errors?.length) {
    throw new Error(errors.map((e) => e.message).join("; "));
  }

  const { getShopProductTier } = await import("./product-limits.server.js");
  const productTier = await getShopProductTier(shop);

  const locale = getStoreLocale(data);
  const catalogData = await prepareCatalogData(admin, data, productTier.effectiveLimit);
  const snapshot = analyzeSnapshot(catalogData, locale);
  const marketOverrides = await getShopMarketSettings(shop);
  const marketContext = buildMarketContext(data, marketOverrides);
  const priorityProducts = getPriorityProducts(
    catalogData.products?.nodes ?? [],
    snapshot.matrix,
    productTier.effectiveLimit,
  );
  const categories = groupProductsByCategory(
    catalogData.products?.nodes ?? [],
    snapshot.matrix,
    marketContext,
    data.shop.name,
  );
  const jsonLd = buildOrganizationJsonLd(
    data.shop,
    marketContext,
    data.locations?.nodes ?? [],
    categories,
    priorityProducts,
  );
  const { active: schemaActive } = await getSchemaStatus(shop);
  const preview = await buildPreviewPlan(priorityProducts, data.shop.name, snapshot.matrix, {
    jsonLd,
    schemaActive,
    marketContext,
    shop: data.shop,
    salesRanking: catalogData.salesRanking ?? null,
    aiPolishLimit: productTier.aiPolishLimit,
  });

  const beforeExecBase = analyzeExecutive(catalogData, locale, {
    previewItems: preview.items,
    schemaActive,
    schemaPending: preview.schema?.willApply,
  });
  const probabilistic = computeProbabilisticScore({
    priorityProducts,
    marketContext,
    schemaActive,
    schemaPending: preview.schema?.willApply,
    previewItems: preview.items,
    salesRanking: catalogData.salesRanking ?? null,
  });
  const beforeExec = attachProbabilisticToExecutive(beforeExecBase, probabilistic);

  return {
    data,
    locale,
    catalogData,
    snapshot,
    jsonLd,
    schemaActive,
    preview,
    beforeExec,
    marketContext,
    priorityProducts,
    productTier,
  };
}

export async function runStoreApply(admin, shop, { applyKind = APPLY_KIND.SETUP } = {}) {
  const { locale, preview, jsonLd, beforeExec, marketContext, data, priorityProducts, productTier } =
    await buildApplyContext(admin, shop);

  if (preview.productCount === 0 && !preview.schema?.willApply) {
    return { skipped: true, reason: "no_changes", preview, beforeExec };
  }

  if (!marketContext?.configured) {
    return { skipped: true, reason: "markets_not_configured", preview, beforeExec };
  }

  const batchId = `batch_${Date.now()}`;

  const { captureGscBaseline, captureGscLatest } = await import("./search-console.server.js");
  const gscBefore = await captureGscBaseline(shop).catch(() => null);

  const result = await applyPreviewPlan(admin, shop, preview, batchId, {
    jsonLd,
    shop: data.shop,
    shopName: data.shop?.name ?? shop,
    marketContext,
    priorityProducts,
  });

  if (result.applied === 0 && !result.schemaApplied) {
    return {
      skipped: true,
      reason: result.errors?.length ? "all_failed" : "no_changes",
      preview,
      beforeExec,
      errors: result.errors ?? [],
    };
  }

  const responseAfter = await admin.graphql(CATALOG_QUERY);
  const { data: dataAfter, errors: errorsAfter } = await responseAfter.json();
  let afterExec = beforeExec;
  if (!errorsAfter?.length && dataAfter) {
    const catalogAfter = await prepareCatalogData(admin, dataAfter, productTier.effectiveLimit);
    const marketOverrides = await getShopMarketSettings(shop);
    const marketContextAfter = buildMarketContext(dataAfter, marketOverrides);
    const snapshotAfter = analyzeSnapshot(catalogAfter, locale);
    const priorityAfter = getPriorityProducts(
      catalogAfter.products?.nodes ?? [],
      snapshotAfter.matrix,
      productTier.effectiveLimit,
    );
    const afterBase = analyzeExecutive(catalogAfter, locale, {
      previewItems: [],
      schemaActive: result.schemaApplied || (await getSchemaStatus(shop)).active,
    });
    const afterProb = computeProbabilisticScore({
      priorityProducts: priorityAfter,
      marketContext: marketContextAfter,
      schemaActive: result.schemaApplied || (await getSchemaStatus(shop)).active,
      previewItems: [],
      salesRanking: catalogAfter.salesRanking ?? null,
    });
    afterExec = attachProbabilisticToExecutive(afterBase, afterProb);
  }

  if (applyKind === APPLY_KIND.EXTRA) {
    await consumeExtraApplyCredit(shop);
  }

  await recordApplyRun(shop, {
    kind: applyKind,
    batchId,
    status: APPLY_STATUS.COMPLETED,
    note: result.partial ? `partial:${result.failedCount}` : null,
  });

  const validation = buildValidationReport({
    executive: afterExec,
    marketContext,
    preview,
    applyResult: result,
    schemaActive: result.schemaApplied,
  });

  const { buildApplyImpactSummary, saveApplyImpactReport } = await import("./apply-impact.server.js");
  const gscAfter = await captureGscLatest(shop, { markApply: true }).catch(() => null);

  const sampleProduct = preview.items?.[0]
    ? {
        id: preview.items[0].id,
        handle: preview.items[0].handle,
      }
    : priorityProducts[0]
      ? { id: priorityProducts[0].id, handle: priorityProducts[0].handle }
      : null;

  const { runStorefrontDeliveryCheck } = await import("./storefront-delivery.server.js");
  const deliveryStatus = await runStorefrontDeliveryCheck(admin, shop, {
    sampleProduct: sampleProduct
      ? {
          ...sampleProduct,
          storeUrl: data.shop?.primaryDomain?.url ?? `https://${shop}`,
        }
      : null,
    force: true,
  }).catch(() => null);

  const impact = buildApplyImpactSummary({
    beforeExec,
    afterExec,
    applyResult: result,
    preview,
    productTier,
    gscBefore,
    gscAfter,
    deliveryStatus,
  });
  await saveApplyImpactReport(shop, impact);

  const applyResult = {
    ...result,
    productCount: preview.productCount,
    batchCount: preview.batchCount,
    appliedItems: buildAppliedItemsFromPreview(preview.items),
    scoreBefore: beforeExec.score,
    scoreAfter: afterExec.score,
    scoreProjection: afterExec.scoreProjection,
    catalogScoreBefore: beforeExec.catalogScore,
    foundationScoreBefore: beforeExec.foundationScore,
    catalogScoreAfter: afterExec.catalogScore,
    foundationScoreAfter: afterExec.foundationScore,
    priorityCount: beforeExec.priorityCount,
    applyKind,
    validation,
    marketRegion: marketContext.regionLabel,
    impact,
    deliveryStatus,
  };

  return { skipped: false, applyResult, preview, batchId };
}

export async function recordSkippedMonthlyApply(shop, note) {
  await recordApplyRun(shop, {
    kind: APPLY_KIND.MONTHLY,
    status: APPLY_STATUS.SKIPPED,
    note,
  });
}
