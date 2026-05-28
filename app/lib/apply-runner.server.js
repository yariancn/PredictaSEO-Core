import { CATALOG_QUERY, analyzeExecutive, analyzeSnapshot, getPriorityProducts, prepareCatalogData } from "./diagnostic.server.js";
import { buildOrganizationJsonLd } from "./forense.server.js";
import { buildPreviewPlan, applyPreviewPlan, buildAppliedItemsFromPreview } from "./apply.server.js";
import { getSchemaStatus } from "./schema.server.js";
import { getStoreLocale } from "./locale.js";
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

  const locale = getStoreLocale(data);
  const catalogData = await prepareCatalogData(admin, data);
  const snapshot = analyzeSnapshot(catalogData, locale);
  const jsonLd = buildOrganizationJsonLd(data.shop, snapshot.markets, data.locations?.nodes ?? []);
  const { active: schemaActive } = await getSchemaStatus(shop);
  const priorityProducts = getPriorityProducts(catalogData.products?.nodes ?? [], snapshot.matrix);
  const preview = buildPreviewPlan(priorityProducts, data.shop.name, snapshot.matrix, { jsonLd, schemaActive });

  const beforeExec = analyzeExecutive(catalogData, locale, {
    previewItems: preview.items,
    schemaActive,
    schemaPending: preview.schema?.willApply,
  });

  return { data, locale, catalogData, snapshot, jsonLd, schemaActive, preview, beforeExec };
}

export async function runStoreApply(admin, shop, { applyKind = APPLY_KIND.SETUP } = {}) {
  const { locale, preview, jsonLd, beforeExec } = await buildApplyContext(admin, shop);

  if (preview.productCount === 0 && !preview.schema?.willApply) {
    return { skipped: true, reason: "no_changes", preview, beforeExec };
  }

  const batchId = `batch_${Date.now()}`;
  const result = await applyPreviewPlan(admin, shop, preview, batchId, { jsonLd });

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
    const catalogAfter = await prepareCatalogData(admin, dataAfter);
    afterExec = analyzeExecutive(catalogAfter, locale, {
      previewItems: [],
      schemaActive: result.schemaApplied || (await getSchemaStatus(shop)).active,
    });
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

  const applyResult = {
    ...result,
    productCount: preview.productCount,
    batchCount: preview.batchCount,
    appliedItems: buildAppliedItemsFromPreview(preview.items),
    scoreBefore: beforeExec.score,
    scoreAfter: afterExec.score,
    catalogScoreBefore: beforeExec.catalogScore,
    foundationScoreBefore: beforeExec.foundationScore,
    catalogScoreAfter: afterExec.catalogScore,
    foundationScoreAfter: afterExec.foundationScore,
    priorityCount: beforeExec.priorityCount,
    applyKind,
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
