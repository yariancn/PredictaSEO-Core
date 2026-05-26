const BILLING_TIMEOUT_MS = 8000;

function withTimeout(promise, ms, fallback) {
  return Promise.race([
    promise,
    new Promise((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

export async function loadAuditData(request) {
  const { authenticate, SETUP_PLAN, MAINTENANCE_PLAN } = await import("../shopify.server");
  const { CATALOG_QUERY, analyzeExecutive, analyzeSnapshot, getPriorityProducts, prepareCatalogData } =
    await import("./diagnostic.server.js");
  const { buildForenseReport, buildOrganizationJsonLd, groupProductsByCategory } = await import(
    "./forense.server.js"
  );
  const { buildPreviewPlan, getAppliedCatalogSummary } = await import("./apply.server.js");
  const { getSchemaStatus } = await import("./schema.server.js");
  const { getStoreLocale, t } = await import("./locale.js");
  const { isBillingBypassed, isBillingTest, syncBillingFromShopify } = await import(
    "./billing.server.js"
  );
  const prisma = (await import("../db.server.js")).default;

  const COPY_KEYS = [
    "title", "subtitle", "heroTitle", "heroBody", "scopeNote", "scopeNoteFullCatalog", "scopeNoteFullCatalogExcluded", "selectionNote", "priorityPlanSummary", "priorityScopeSummary", "stepOf",
    "catalogScoreLabel", "foundationScoreLabel", "scoreExplain",
    "scoreBreakdownTitle", "foundationBreakdownTitle", "scoreAfterApply", "scoreGainGeneric", "scoreAlmostComplete", "scoreNow", "scoreImproved", "scoreSeoComplete",
    "factorSeoTitle", "factorSeoDesc", "factorDesc", "factorSchema", "factorSchemaDone",
    "fixSeoDone", "previewAllDone", "previewProductsDone", "previewSchemaOnlyExplain", "previewSchemaRow", "previewSchemaRowDetail", "seeUpdatedScore",
    "whyUsTitle", "whyUs1", "whyUs2", "whyUs3", "whyUs4",
    "pricingTitle", "pricingFree", "pricingSetup", "pricingMaintenance",
    "unlockApply", "subscribeMaintenance", "billingRequired", "restoreWarning",
    "products", "markets", "continue", "back",
    "stateTitle", "impactTitle", "planTitle", "rollbackNote",
    "priorityTitle", "priorityExplain", "rank", "product", "score", "targetScore", "loading", "loadingHint", "error", "impactIntro",
    "previewTitle", "previewApplyIntro", "previewRowTitles", "previewRowDescs", "previewRowBodies",
    "previewRowMirror", "previewRowBatch", "previewRowBrand", "previewMirrorLegend", "previewTableIntro",
    "previewSchema", "previewDesc", "schemaEmbedNote", "before", "after", "seoTitle", "apply", "confirmLabel",
    "reasonNoSeoTitle", "reasonNoSeoDesc", "reasonNoDesc", "reasonGiftCard", "reasonNoTags",
    "selectionFromBestSellers", "selectionFromRanking", "selectionFromSales", "selectionFullCatalog", "selectionFullCatalogExcluded",
    "applying", "applySuccess", "applySuccessWithSchema", "applySuccessSchemaOnly", "applyError", "noChanges", "noChangesAlreadyApplied",
    "restore", "restoreAll", "restoreAllConfirm", "restoreAllSuccess", "restoreAllSchemaOnly", "restoreAllHint", "restoreSuccess", "restoring",
    "resetTestTitle", "resetTestBody", "resetTestConfirm", "resetTestSuccess", "resetTestLoading",
    "resetTitle", "resetBody", "resetHint",
    "scoreMaxNote",
    "resultsTitle", "resultsScoreExplainSchemaOnly", "resultsScoreExplainFull", "resultsScoreExplainProducts",
    "resultsAppliedTitle", "resultsAppliedBrand", "resultsAppliedProductsUpdated", "resultsAppliedProductsVerified",
    "resultsScoreBreakdownTitle", "resultsScoreRowCatalog", "resultsScoreRowBrand", "resultsBackupNote",
    "resultsTimeline", "moreProducts",
    "resultsProductsTitle", "changeSearchTitle", "changeSearchDesc", "changeProductDesc",
    "setupCompleteTitle", "setupCompleteBody", "viewScoreDashboard", "viewSummary",
    "expectationsTitle", "expectationsMeansTitle", "expectationsMeans1", "expectationsMeans2", "expectationsMeans2ProductsDone",
    "expectationsNotTitle", "expectationsNot1", "expectationsNot2",
    "expectationsDoneTitle", "expectationsDone1Updated", "expectationsDone1Verified", "expectationsDone2", "expectationsDone3", "expectationsDone4",
    "expectationsTimelineTitle", "expectationsTimeline1", "expectationsTimeline2",
    "maintenancePlanTitle", "maintenancePlanIntro", "maintenancePlan1", "maintenancePlan2", "maintenancePlan3", "maintenancePlanNote",
  ];

  const buildCopy = (locale) =>
    Object.fromEntries(COPY_KEYS.map((key) => [key, t(locale, key)]));

  const { admin, session, billing } = await authenticate.admin(request);

  const response = await admin.graphql(CATALOG_QUERY);
  const { data, errors } = await response.json();

  if (errors?.length) {
    return {
      shop: session.shop,
      error: errors.map((e) => e.message).join("; "),
    };
  }

  const locale = getStoreLocale(data);
  const catalogData = await prepareCatalogData(admin, data);
  const snapshot = analyzeSnapshot(catalogData, locale);
  const categories = groupProductsByCategory(catalogData.products?.nodes ?? [], snapshot.matrix);
  const jsonLd = buildOrganizationJsonLd(
    data.shop,
    snapshot.markets,
    data.locations?.nodes ?? [],
  );
  const { active: schemaActive } = await getSchemaStatus(session.shop);
  const priorityProducts = getPriorityProducts(catalogData.products?.nodes ?? [], snapshot.matrix);
  const preview = buildPreviewPlan(priorityProducts, data.shop.name, snapshot.matrix, {
    jsonLd,
    schemaActive,
  });
  const executive = analyzeExecutive(catalogData, locale, {
    previewItems: preview.items,
    schemaActive,
    schemaPending: preview.schema?.willApply,
  });
  const report = buildForenseReport(data, executive, snapshot, categories, locale, preview);

  const appliedCatalog = await getAppliedCatalogSummary(
    session.shop,
    catalogData.products?.nodes ?? [],
    (key) => t(locale, key),
  );

  let hasBackup = false;
  let backupBatchCount = 0;
  try {
    hasBackup =
      (await prisma.optimizationSnapshot.count({ where: { shop: session.shop } })) > 0;
    backupBatchCount = (
      await prisma.optimizationSnapshot.groupBy({
        by: ["batchId"],
        where: { shop: session.shop },
      })
    ).length;
  } catch {
    hasBackup = false;
    backupBatchCount = 0;
  }

  let billingStatus = {
    canApply: isBillingBypassed(),
    setupPaid: isBillingBypassed(),
    subscriptionActive: isBillingBypassed(),
    pilotMode: isBillingBypassed(),
  };

  if (!isBillingBypassed()) {
    billingStatus = await withTimeout(
      (async () => {
        try {
          const setupCheck = await billing.check({
            plans: [SETUP_PLAN],
            isTest: isBillingTest(),
          });
          const subCheck = await billing.check({
            plans: [MAINTENANCE_PLAN],
            isTest: isBillingTest(),
          });
          await syncBillingFromShopify(session.shop, setupCheck, subCheck);
          return {
            canApply: setupCheck.hasActivePayment,
            setupPaid: setupCheck.hasActivePayment,
            subscriptionActive: subCheck.hasActivePayment,
            pilotMode: false,
          };
        } catch {
          const record = await prisma.shopBilling.findUnique({ where: { shop: session.shop } });
          return {
            canApply: record?.setupPaid ?? false,
            setupPaid: record?.setupPaid ?? false,
            subscriptionActive: record?.subscriptionActive ?? false,
            pilotMode: false,
          };
        }
      })(),
      BILLING_TIMEOUT_MS,
      { canApply: false, setupPaid: false, subscriptionActive: false, pilotMode: false },
    );
  }

  return {
    shop: session.shop,
    shopName: data.shop.name,
    error: null,
    locale,
    copy: buildCopy(locale),
    executive,
    snapshot,
    report,
    preview,
    appliedCatalog,
    hasBackup,
    backupBatchCount,
    billing: billingStatus,
  };
}
