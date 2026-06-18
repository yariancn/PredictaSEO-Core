const BILLING_TIMEOUT_MS = 8000;

function withTimeout(promise, ms, fallback) {
  return Promise.race([
    promise,
    new Promise((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

export async function loadAuditData(request) {
  const { authenticate, SETUP_PLAN } = await import("../shopify.server");
  const { CATALOG_QUERY, analyzeExecutive, analyzeSnapshot, getPriorityProducts, prepareCatalogData } =
    await import("./diagnostic.server.js");
  const { buildForenseReport, buildOrganizationJsonLd, groupProductsByCategory } = await import(
    "./forense.server.js"
  );
  const { buildPreviewPlan, getAppliedCatalogSummary } = await import("./apply.server.js");
  const { getSchemaStatus } = await import("./schema.server.js");
  const { getStoreLocale, t } = await import("./locale.js");
  const { isBillingBypassed, isBillingTest, syncBillingFromShopify, canUsePilotReset } = await import(
    "./billing.server.js"
  );
  const prisma = (await import("../db.server.js")).default;

  const COPY_KEYS = [
    "title", "subtitle", "heroTitle", "heroBody", "introTitle", "introBody", "introBullet1", "introBullet2", "introBullet3",
    "introNoChanges", "startAuditButton", "monthlyBeforePayTitle", "monthlyBeforePayBody",
    "generateAiPlan", "skipAiPlan", "step3AiTitle", "step3AiIntro", "step3ContinueWait", "step3ContinueReady", "generateAiPlanBody", "skipAiPlanBody",
    "retryAiPlan", "aiTimeout", "aiNotConfigured", "previewNotAppliedYet",
    "billingStatusTitle", "billingStatusNone", "billingStatusSetupOnly", "billingStatusActive", "billingShopifyReceipt",
    "scopeNote", "scopeNoteFullCatalog", "scopeNoteFullCatalogExcluded", "selectionNote", "priorityPlanSummary", "priorityScopeSummary", "stepOf",
    "catalogScoreLabel", "foundationScoreLabel", "scoreExplain",
    "scorePlainTitle", "scorePlainBody", "scorePlain1", "scorePlain2", "scorePlain3", "scorePlain4", "scorePlainLow",
    "catalogCountExplain", "restoreVsResetTitle", "restoreVsResetBody", "restoreVsResetWarning",
    "scoreBreakdownTitle", "foundationBreakdownTitle", "scoreAfterApply", "scoreGainGeneric", "scoreAlmostComplete", "scoreNow", "scoreImproved", "scoreSeoComplete",
    "factorSeoTitle", "factorSeoDesc", "factorDesc", "factorSchema", "factorSchemaDone",
    "fixSeoDone", "previewAllDone", "previewProductsDone", "previewSchemaOnlyExplain", "previewSchemaRow", "previewSchemaRowDetail", "seeUpdatedScore",
    "whyUsTitle", "whyUs1", "whyUs2", "whyUs3", "whyUs4",
    "pricingTitle", "pricingFree", "pricingSetup", "pricingMaintenance", "billingFootnote", "pricingMaintenanceIncluded",
    "step4FlowTitle", "step4FlowIntro", "step2PayIntro", "step2NoPendingWork", "billingAlreadyApproved", "step4PaymentBodyFirst", "step4PaymentSuccess", "step4PaidIntro", "step4RestoreToContinue", "applyAlreadyDone", "unlockApply", "alreadyOptimizedTitle", "alreadyOptimizedBody",
    "refreshingStore", "confirmingPayment",
    "unlockApply", "subscribeMaintenance", "billingRequired", "restoreWarning", "restoreLastConfirm", "restoreLastHint",
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
    "setupCompleteTitle", "setupCompleteBody", "viewScoreDashboard", "viewSummary", "postApplyTitle", "postApplyBody", "viewDashboard", "exitApp",
    "expectationsTitle", "expectationsPreviewTitle",
    "expectationsPreviewMeans1", "expectationsPreviewMeans2", "expectationsPreviewNot1", "expectationsPreviewNot2",
    "expectationsPreviewTimeline1", "expectationsPreviewTimeline2",
    "expectationsPreviewMaintenanceTitle", "expectationsPreviewMaintenance1", "expectationsPreviewMaintenance2", "expectationsPreviewMaintenance3",
    "expectationsMeansTitle", "expectationsMeans1", "expectationsMeans2", "expectationsMeans2ProductsDone",
    "expectationsNotTitle", "expectationsNot1", "expectationsNot2",
    "expectationsDoneTitle", "expectationsDone1Updated", "expectationsDone1Verified", "expectationsDone2", "expectationsDone3", "expectationsDone4",
    "expectationsTimelineTitle", "expectationsTimeline1", "expectationsTimeline2",
    "maintenancePlanTitle", "maintenancePlanIntro", "maintenancePlan1", "maintenancePlan2", "maintenancePlan3", "maintenancePlanNote",
    "applyQuotaTitle", "applyQuotaSetup", "applyQuotaMonthlyAuto", "applyQuotaMonthlyDone", "applyQuotaExtraAvailable",
    "applyQuotaExtraPayment", "applyQuotaExtraPaymentBody", "applyQuotaNoSubscription", "payExtraApply", "confirmExtraApply",
    "extraApplySuccess", "applyQuotaPeriod",
    "uninstallPrefTitle", "uninstallPrefIntro", "uninstallPrefRestoreLabel", "uninstallPrefRestoreBody",
    "uninstallPrefKeepLabel", "uninstallPrefKeepBody", "uninstallPrefSaved", "uninstallPrefSteps",
    "marketsPanelTitle", "marketsPanelBody", "marketsDetected", "marketsCountries", "marketsConfirmButton",
    "marketsConfirmed", "marketsNotConfigured", "marketsConfirmRequired", "scoreProjectionLabel",
    "scoreConfidenceHigh", "scoreConfidenceModerate", "validationTitle", "validationSummaryPass",
    "validationSummaryReview", "factorMarketAlignment", "factorCatalogCompleteness", "factorBrandEntity",
    "factorSemanticRichness", "factorCommercialSignals",
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

  const { getShopMarketSettings } = await import("./shop-market.server.js");
  const { buildMarketContext } = await import("./markets.server.js");
  const { computeProbabilisticScore, attachProbabilisticToExecutive } = await import(
    "./score-probability.server.js"
  );
  const { buildValidationReport } = await import("./validation.server.js");

  const marketOverrides = await getShopMarketSettings(session.shop);
  const marketContext = buildMarketContext(data, marketOverrides);
  const priorityProducts = getPriorityProducts(catalogData.products?.nodes ?? [], snapshot.matrix);
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
  const { active: schemaActive } = await getSchemaStatus(session.shop);
  const preview = await buildPreviewPlan(priorityProducts, data.shop.name, snapshot.matrix, {
    jsonLd,
    schemaActive,
    marketContext,
    shop: data.shop,
  });
  const executiveBase = analyzeExecutive(catalogData, locale, {
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
  const executive = attachProbabilisticToExecutive(executiveBase, probabilistic);
  const report = buildForenseReport(
    data,
    executive,
    snapshot,
    categories,
    locale,
    preview,
    marketContext,
  );
  const validation = buildValidationReport({
    executive,
    marketContext,
    preview,
    schemaActive,
  });

  const appliedCatalog = await getAppliedCatalogSummary(
    session.shop,
    catalogData.products?.nodes ?? [],
    (key) => t(locale, key),
  );

  let hasBackup = false;
  let backupBatchCount = 0;
  let backupSummary = null;
  try {
    const { ensureShopBaseline, getBackupSummary, captureBaselineFromCatalog } = await import(
      "./shop-baseline.server.js"
    );
    const { hasRecordedSetupApply } = await import("./apply-quota.server.js");
    const alreadyApplied = await hasRecordedSetupApply(session.shop);
    if (!alreadyApplied) {
      await captureBaselineFromCatalog(admin, session.shop, priorityProducts, data.shop?.id);
    }
    backupSummary = await getBackupSummary(session.shop);
    hasBackup = backupSummary.hasActiveBackup || backupSummary.hasBaseline;
    backupBatchCount = backupSummary.applyBatchCount;
  } catch {
    hasBackup = false;
    backupBatchCount = 0;
    backupSummary = null;
  }

  let uninstallRestorePreference = "restore";
  try {
    const { getUninstallRestorePreference } = await import("./shop-lifecycle.server.js");
    uninstallRestorePreference = await getUninstallRestorePreference(session.shop);
  } catch {
    uninstallRestorePreference = "restore";
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
          await syncBillingFromShopify(session.shop, setupCheck);
          const setupPaid = setupCheck.hasActivePayment;
          if (setupPaid) {
            const { ensureDeferredMaintenanceSubscription } = await import("./billing-maintenance.server.js");
            ensureDeferredMaintenanceSubscription(admin, session.shop, { isTest: isBillingTest() }).catch(() => {});
          }
          const base = {
            canApply: setupPaid,
            setupPaid,
            subscriptionActive: setupPaid,
            pilotMode: false,
          };
          const { getApplyQuotaStatus } = await import("./apply-quota.server.js");
          const applyQuota = await getApplyQuotaStatus(session.shop, base);
          return { ...base, applyQuota };
        } catch {
          const record = await prisma.shopBilling.findUnique({ where: { shop: session.shop } });
          const base = {
            canApply: record?.setupPaid ?? false,
            setupPaid: record?.setupPaid ?? false,
            subscriptionActive: record?.setupPaid ?? record?.subscriptionActive ?? false,
            pilotMode: false,
          };
          const { getApplyQuotaStatus } = await import("./apply-quota.server.js");
          const applyQuota = await getApplyQuotaStatus(session.shop, base);
          return { ...base, applyQuota };
        }
      })(),
      BILLING_TIMEOUT_MS,
      (async () => {
        const record = await prisma.shopBilling.findUnique({ where: { shop: session.shop } });
        const base = {
          canApply: record?.setupPaid ?? false,
          setupPaid: record?.setupPaid ?? false,
          subscriptionActive: record?.setupPaid ?? record?.subscriptionActive ?? false,
          pilotMode: false,
        };
        const { getApplyQuotaStatus } = await import("./apply-quota.server.js");
        const applyQuota = await getApplyQuotaStatus(session.shop, base);
        return { ...base, applyQuota };
      })(),
    );
  } else {
    const { getApplyQuotaStatus } = await import("./apply-quota.server.js");
    billingStatus.applyQuota = await getApplyQuotaStatus(session.shop, billingStatus);
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
    backupSummary,
    billing: billingStatus,
    uninstallRestorePreference,
    aiSummaryAvailable: Boolean(process.env.GEMINI_API_KEY?.trim()),
    marketContext,
    validation,
    canPilotReset: canUsePilotReset(session.shop),
  };
}
