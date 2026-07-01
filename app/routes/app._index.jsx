import { json } from "@remix-run/node";
import { Form, useFetcher, useLoaderData, useRouteError, isRouteErrorResponse } from "@remix-run/react";
import { useEffect, useRef, useState } from "react";
import { LoadingShell } from "../components/AppShell.jsx";
import { AppErrorShell, auditErrorCopy, routeErrorHint, routeErrorMessage } from "../components/AppErrorShell.jsx";
import { formatStepLabel } from "../lib/locale.js";
import { copyText, getPreviewChangeStats, fillCopy } from "../lib/preview.js";
import {
  ApplyImpactPanel,
  BenchmarkPanel,
  DeliveryChecklistPanel,
  MarketsChangedBanner,
  ProductTierPanel,
  SearchConsolePanel,
  ThemeOnboardingPanel,
} from "../components/PremiumPanels.jsx";
import { formatProjectedScoreRange } from "../lib/score.js";

export async function loader({ request }) {
  const { authenticate } = await import("../shopify.server");
  const { admin, session } = await authenticate.admin(request);
  const { t, resolveShopLocale } = await import("../lib/locale.js");
  const { fillCopy } = await import("../lib/preview.js");
  const {
    BASE_PRODUCT_LIMIT,
    TOP_AI_PRODUCTS,
    EXTRA_PRODUCT_PACK_PRICE,
    EXTRA_PRODUCT_PACK_SIZE,
  } = await import("../lib/product-limits.server.js");
  const locale = await resolveShopLocale(admin);
  const limitVars = {
    scanLimit: BASE_PRODUCT_LIMIT,
    aiLimit: TOP_AI_PRODUCTS,
    packSize: EXTRA_PRODUCT_PACK_SIZE,
    packPrice: EXTRA_PRODUCT_PACK_PRICE,
  };
  const introKeys = [
    "title", "subtitle", "introTitle", "introBenefitTitle", "introBenefitLead", "introBody",
    "introBullet1", "introBullet2", "introBullet3",
    "introNoChanges", "pricingTitle", "pricingFree", "pricingSetup", "pricingScope", "pricingExtra", "pricingRecurringNote",
    "startAuditButton", "loading", "loadingAuditSubtext", "loadingAiSummary", "loadingAiSummarySubtext",
    "auditLoadTimeout", "auditLoadTimeoutHint",
    "optimizingStore", "optimizingStoreSubtext",
  ];
  const introCopy = Object.fromEntries(
    introKeys.map((key) => [key, fillCopy(t(locale, key), limitVars)]),
  );
  const { isPilotApp } = await import("../lib/env.server.js");
  return json({ shop: session.shop, introCopy, locale, showGrowthHub: isPilotApp() });
}

export async function action({ request }) {
  const { authenticate, SETUP_PLAN } = await import("../shopify.server");
  const { CATALOG_QUERY, analyzeExecutive, analyzeSnapshot, getPriorityProducts, prepareCatalogData } =
    await import("../lib/diagnostic.server.js");
  const {
    buildForenseReport,
    buildOrganizationJsonLd,
    generateForenseBrief,
    groupProductsByCategory,
    saveEntityProfile,
  } = await import("../lib/forense.server.js");
  const { buildPreviewPlan, applyPreviewPlan, rollbackLatestBatch, rollbackAllBatches, resetTestStoreForDemo, buildAppliedItemsFromPreview } = await import(
    "../lib/apply.server.js"
  );
  const { getSchemaStatus } = await import("../lib/schema.server.js");
  const { getStoreLocale, t, resolveShopLocale } = await import("../lib/locale.js");
  const { isBillingBypassed, isBillingTest, canUsePilotReset } = await import("../lib/billing.server.js");

  const { admin, session, billing } = await authenticate.admin(request);
  const storeLocale = await resolveShopLocale(admin);
  const form = await request.formData();
  const intent = form.get("intent");

  if (intent === "restore") {
    try {
      const result = await rollbackLatestBatch(admin, session.shop);
      const { resetApplyQuotaAfterRestore } = await import("../lib/apply-quota.server.js");
      await resetApplyQuotaAfterRestore(session.shop);
      return json({ intent: "restore", restoreResult: result });
    } catch (err) {
      return json({ intent: "restore", restoreError: err.message ?? "Restore failed" });
    }
  }

  if (intent === "restore-all") {
    try {
      const { fullRestoreShopToOriginal } = await import("../lib/shop-baseline.server.js");
      const result = await fullRestoreShopToOriginal(admin, session.shop, { resetQuota: true });
      return json({ intent: "restore-all", restoreResult: result });
    } catch (err) {
      return json({ intent: "restore-all", restoreError: err.message ?? "Restore failed" });
    }
  }

  if (intent === "reset-test-store") {
    if (!canUsePilotReset(session.shop)) {
      return json({ intent: "reset-test-store", resetTestError: "Not available in production billing mode" });
    }
    try {
      const response = await admin.graphql(CATALOG_QUERY);
      const { data, errors } = await response.json();
      if (errors?.length) {
        return json({ intent: "reset-test-store", resetTestError: errors.map((e) => e.message).join("; ") });
      }
      const catalogData = await prepareCatalogData(admin, data);
      const snapshot = analyzeSnapshot(catalogData, getStoreLocale(data));
      const priorityProducts = getPriorityProducts(catalogData.products?.nodes ?? [], snapshot.matrix);
      const result = await resetTestStoreForDemo(admin, session.shop, { priorityProducts });
      return json({ intent: "reset-test-store", resetTestResult: result });
    } catch (err) {
      return json({ intent: "reset-test-store", resetTestError: err.message ?? "Reset failed" });
    }
  }

  if (intent === "billing-setup") {
    if (isBillingBypassed()) {
      return json({
        intent: "billing-setup",
        billingError: "Billing is disabled in pilot mode — you can Apply without payment.",
      });
    }
    const { runBillingSetupFlow } = await import("../lib/billing-flow.server.js");
    return runBillingSetupFlow({
      admin,
      billing,
      session,
      isTest: isBillingTest(),
      SETUP_PLAN,
      syncBillingFromShopify: (await import("../lib/billing.server.js")).syncBillingFromShopify,
    });
  }

  if (intent === "set-uninstall-preference") {
    const { setUninstallRestorePreference, UNINSTALL_PREF } = await import("../lib/shop-lifecycle.server.js");
    const preference = form.get("preference");
    try {
      await setUninstallRestorePreference(session.shop, preference);
      return json({
        intent: "set-uninstall-preference",
        uninstallRestorePreference:
          preference === UNINSTALL_PREF.KEEP ? UNINSTALL_PREF.KEEP : UNINSTALL_PREF.RESTORE,
      });
    } catch (err) {
      return json({ intent: "set-uninstall-preference", preferenceError: err.message ?? "Could not save" });
    }
  }

  if (intent === "confirm-markets") {
    try {
      const response = await admin.graphql(CATALOG_QUERY);
      const { data, errors } = await response.json();
      if (errors?.length) {
        return json({ intent: "confirm-markets", marketError: errors.map((e) => e.message).join("; ") });
      }
      const rawCodes = String(form.get("countryCodes") ?? "")
        .split(",")
        .map((c) => c.trim().toUpperCase())
        .filter(Boolean);
      if (rawCodes.length === 0) {
        const { t: tr } = await import("../lib/locale.js");
        return json({
          intent: "confirm-markets",
          marketError: tr(storeLocale, "marketsSelectRequired"),
        });
      }
      const { buildMarketContext } = await import("../lib/markets.server.js");
      const { saveShopMarketConfirmation } = await import("../lib/shop-market.server.js");
      const marketContext = buildMarketContext(data, { confirmed: true, countryCodes: rawCodes });
      await saveShopMarketConfirmation(session.shop, marketContext);
      return json({ intent: "confirm-markets", marketConfirmed: true, regionLabel: marketContext.regionLabel });
    } catch (err) {
      return json({ intent: "confirm-markets", marketError: err.message ?? "Could not save markets" });
    }
  }

  if (intent === "apply") {
    if (form.get("confirmed") !== "1") {
      return json({ intent: "apply", applyError: "Confirmation required" });
    }

    const pilotMode = isBillingBypassed();
    let setupPaid = pilotMode;

    if (!pilotMode) {
      const setupCheck = await billing.check({
        plans: [SETUP_PLAN],
        isTest: isBillingTest(),
      });
      setupPaid = setupCheck.hasActivePayment;
      const { syncBillingFromShopify } = await import("../lib/billing.server.js");
      await syncBillingFromShopify(session.shop, setupCheck);
      if (!setupPaid) {
        const { t: tr } = await import("../lib/locale.js");
        return json({ intent: "apply", applyError: tr(storeLocale, "billingRequired"), billingBlocked: true });
      }
    }

    const { resolveManualApplyPermission } = await import("../lib/apply-quota.server.js");
    const permission = await resolveManualApplyPermission(session.shop, {
      pilotMode,
      setupPaid,
    });

    if (!permission.allowed) {
      const { t: tr } = await import("../lib/locale.js");
      const messageKey =
        permission.reason === "already_applied" ? "applyAlreadyDone" : "billingRequired";
      return json({
        intent: "apply",
        applyError: tr(storeLocale, messageKey),
        applyQuotaBlocked: true,
        blockReason: permission.reason,
      });
    }

    try {
      const { runStoreApply } = await import("../lib/apply-runner.server.js");
      const outcome = await runStoreApply(admin, session.shop, { applyKind: permission.kind });

      if (outcome.skipped) {
        const { t: tr } = await import("../lib/locale.js");
        const msg =
          outcome.reason === "markets_not_configured"
            ? tr(storeLocale, "marketsNotConfigured")
            : outcome.reason === "all_failed"
            ? outcome.errors?.slice(0, 2).join("; ") || tr(storeLocale, "applyError")
            : tr(storeLocale, "noChangesAlreadyApplied");
        return json({ intent: "apply", applyError: msg });
      }

      return json({
        intent: "apply",
        applyResult: outcome.applyResult,
        hasBackup: true,
      });
    } catch (err) {
      return json({ intent: "apply", applyError: err.message ?? "Apply failed" });
    }
  }

  if (intent !== "summary") {
    return json({ error: "Invalid action" });
  }

  if (!process.env.GEMINI_API_KEY) {
    const { t } = await import("../lib/locale.js");
    return json({ intent: "summary", summaryError: t("en", "aiUnavailable") });
  }

  let data = null;
  try {
    const response = await admin.graphql(CATALOG_QUERY);
    const parsed = await response.json();
    data = parsed.data;
    const { errors } = parsed;
    if (errors?.length) {
      return json({
        intent: "summary",
        summaryError: errors.map((e) => e.message).join("; "),
      });
    }

    const locale = getStoreLocale(data);
    const catalogData = await prepareCatalogData(admin, data);
    const snapshot = analyzeSnapshot(catalogData, locale);
    const { buildMarketContext } = await import("../lib/markets.server.js");
    const { getShopMarketSettings } = await import("../lib/shop-market.server.js");
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
    const executive = analyzeExecutive(catalogData, locale, {
      previewItems: preview.items,
      schemaActive,
      schemaPending: preview.schema?.willApply,
    });
    const report = buildForenseReport(data, executive, snapshot, categories, locale, preview, marketContext);

    const summary = await generateForenseBrief(data.shop, marketContext, report, locale);

    await saveEntityProfile(session.shop, {
      entityName: data.shop.name,
      specialization: report.fixes[0],
      areaServed: marketContext.regionLabel,
      entityHook: null,
      jsonLdDraft: JSON.stringify(jsonLd, null, 2),
      aiVerdict: summary,
    });

    return json({ intent: "summary", summary, summaryError: null });
  } catch (err) {
    const locale = getStoreLocale(data ?? {});
    const { t } = await import("../lib/locale.js");
    const msg = err.message ?? "";
    const summaryError =
      msg.includes("AI timeout") ? t(locale, "aiTimeout") : t(locale, "aiError");
    return json({ intent: "summary", summaryError });
  }
}

export function shouldRevalidate() {
  return false;
}

const theme = {
  page: {
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    padding: "28px 24px 40px",
    background: "linear-gradient(165deg, #0c0c14 0%, #12121c 50%, #0a0a10 100%)",
    color: "#e8e8ed",
    minHeight: "100vh",
    maxWidth: "720px",
    margin: "0 auto",
  },
  card: {
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: "14px",
    padding: "20px 22px",
    marginBottom: "14px",
  },
  h2: {
    margin: "0 0 12px 0",
    fontSize: "0.72rem",
    fontWeight: 600,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "#8b8b9a",
  },
  body: {
    margin: 0,
    fontSize: "0.95rem",
    lineHeight: 1.55,
    color: "#c8c8d0",
  },
  scoreRing: (score) => ({
    width: "88px",
    height: "88px",
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "1.5rem",
    fontWeight: 700,
    color: score < 60 ? "#f87171" : "#a3e635",
    background: `conic-gradient(${score < 60 ? "#f87171" : "#a3e635"} ${score * 3.6}deg, rgba(255,255,255,0.06) 0deg)`,
    flexShrink: 0,
  }),
  scoreInner: {
    width: "72px",
    height: "72px",
    borderRadius: "50%",
    background: "#12121c",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  btnPrimary: {
    width: "100%",
    padding: "14px 20px",
    marginTop: "8px",
    background: "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)",
    color: "#fff",
    border: "none",
    borderRadius: "10px",
    fontSize: "0.95rem",
    fontWeight: 600,
    cursor: "pointer",
    boxShadow: "0 4px 20px rgba(99,102,241,0.35)",
  },
  btnGhost: {
    padding: "14px 20px",
    marginTop: "8px",
    background: "transparent",
    color: "#8b8b9a",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: "10px",
    fontSize: "0.9rem",
    cursor: "pointer",
    flex: 1,
  },
  btnDisabled: {
    width: "100%",
    padding: "14px 20px",
    marginTop: "8px",
    background: "rgba(255,255,255,0.06)",
    color: "#6b6b78",
    border: "1px solid rgba(255,255,255,0.06)",
    borderRadius: "10px",
    fontSize: "0.9rem",
    cursor: "not-allowed",
  },
  btnRestore: {
    width: "100%",
    padding: "14px 20px",
    marginTop: "12px",
    background: "rgba(251,191,36,0.15)",
    color: "#fde68a",
    border: "1px solid rgba(251,191,36,0.6)",
    borderRadius: "10px",
    fontSize: "0.95rem",
    fontWeight: 600,
    cursor: "pointer",
    boxShadow: "0 2px 12px rgba(251,191,36,0.2)",
  },
  bullet: (color) => ({
    margin: "0 0 8px 0",
    paddingLeft: "14px",
    borderLeft: `2px solid ${color}`,
    fontSize: "0.9rem",
    lineHeight: 1.45,
    color: "#c8c8d0",
  }),
  progressDot: (active, done) => ({
    width: "8px",
    height: "8px",
    borderRadius: "50%",
    background: done ? "#6366f1" : active ? "#a5b4fc" : "rgba(255,255,255,0.15)",
  }),
};

export function ErrorBoundary() {
  const error = useRouteError();
  const message = isRouteErrorResponse(error)
    ? `${error.status} — ${error.statusText || "Unable to load"}`
    : routeErrorMessage(error);

  return <AppErrorShell message={message} hint={routeErrorHint(error)} />;
}

function Progress({ step, total }) {
  return (
    <div style={{ display: "flex", gap: "8px", justifyContent: "center", marginBottom: "24px" }}>
      {Array.from({ length: total }, (_, i) => (
        <div key={i} style={theme.progressDot(i + 1 === step, i + 1 < step)} />
      ))}
    </div>
  );
}

function fillTemplate(text, vars = {}) {
  let out = text;
  for (const [key, value] of Object.entries(vars)) {
    out = out.replaceAll(`{{${key}}}`, String(value));
  }
  return out;
}

function formatResetTestMessage(copy, result) {
  if (!result) return "";
  if (result.baselineRestored) {
    return fillTemplate(copyText(copy, "resetTestSuccessBaseline", ""), {
      products: String(result.baselineProductCount ?? result.productCount ?? 0),
      schema: result.schemaRestored
        ? copyText(copy, "previewSchemaRow", "brand identity")
        : copyText(copy, "resetTestNoSchema", "no brand identity"),
    });
  }
  if (result.strippedForDemo > 0) {
    return fillTemplate(copyText(copy, "resetTestSuccessStripped", ""), {
      count: String(result.strippedForDemo),
    });
  }
  return formatRestoreMessage(copy, "restore-all", result);
}

function formatRestoreMessage(copy, intent, result) {
  if (!result) return "";
  if (result.method === "baseline" || result.baselineRestored) {
    return fillTemplate(copyText(copy, "restoreBaselineSuccess", ""), {
      products: String(result.baselineProductCount ?? result.productCount ?? 0),
    });
  }
  const products = String(result.productCount ?? 0);
  const batches = String(result.batches ?? 0);
  const snapshotCount = result.snapshotCount ?? result.restored ?? 0;
  const schema = result.schemaRestored
    ? copyText(copy, "previewSchemaRow", "Brand identity (Schema.org)")
    : copyText(copy, "previewSchemaRow", "brand identity");

  if (
    (intent === "restore-all" || intent === "reset-test-store") &&
    snapshotCount === 0 &&
    batches === "0"
  ) {
    return copyText(
      copy,
      "restoreNothingFound",
      "Nothing to restore — no PredictaCore backup found for this store.",
    );
  }

  if (
    (intent === "restore-all" || intent === "reset-test-store") &&
    result.productCount === 0 &&
    result.schemaRestored
  ) {
    return copyText(copy, "restoreAllSchemaOnly", "Brand identity restored. No product SEO was in the backup.");
  }
  if (intent === "restore-all" || intent === "reset-test-store") {
    return fillTemplate(copyText(copy, "restoreAllSuccess", ""), { products, batches, schema });
  }
  return fillTemplate(copyText(copy, "restoreSuccess", ""), { products });
}

function ScoreBreakdownRow({ label, before, after }) {
  const changed = before !== after;
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: "12px",
        padding: "8px 0",
        borderTop: "1px solid rgba(255,255,255,0.06)",
        fontSize: "0.82rem",
      }}
    >
      <span style={{ color: "#c8c8d0" }}>{label}</span>
      <span style={{ color: changed ? "#a3e635" : "#8b8b9a", fontWeight: changed ? 600 : 400, whiteSpace: "nowrap" }}>
        {before}/100 → {after}/100
      </span>
    </div>
  );
}

function PreviewChangesPanel({
  copy,
  preview,
  previewStats,
  schemaOnlyPreview,
  shopName,
  shop,
  region,
  setupPaid = false,
}) {
  const previewLead = setupPaid
    ? copyText(copy, "previewAwaitApply", copy.previewNotAppliedYet)
    : copy.previewNotAppliedYet;

  return (
    <div style={theme.card}>
      <h2 style={theme.h2}>{copy.previewTitle}</h2>
      <p style={{ ...theme.body, marginBottom: "12px", fontSize: "0.82rem", color: "#a5b4fc" }}>
        {previewLead}
      </p>
      {schemaOnlyPreview ? (
        <>
          <p style={{ ...theme.body, marginBottom: "12px", color: "#fbbf24" }}>
            {copyText(copy, "previewProductsDone", "Product SEO is already complete.")}
          </p>
          <p style={{ ...theme.body, marginBottom: "14px", color: "#e8e8ef" }}>
            {fillCopy(copyText(copy, "previewSchemaOnlyExplain", "Brand identity will be saved."), {
              shop: shopName || shop?.replace(".myshopify.com", "") || "your store",
              region: region || "your markets",
            })}
          </p>
          <p style={theme.bullet("#a3e635")}>
            {copyText(copy, "previewRowBrand", "Brand identity for AI search (Schema.org JSON-LD)")}
          </p>
        </>
      ) : (
        <div
          style={{
            marginBottom: "14px",
            padding: "14px 16px",
            borderRadius: "10px",
            background: "rgba(99,102,241,0.12)",
            border: "1px solid rgba(99,102,241,0.25)",
          }}
        >
          <p style={{ ...theme.body, fontWeight: 600, color: "#e8e8ff", marginBottom: "10px" }}>
            {copyText(copy, "previewApplyIntro", "What we'll update on your store")}
          </p>
          {previewStats.searchTitles > 0 && (
            <p style={theme.bullet("#a5b4fc")}>
              {fillCopy(copyText(copy, "previewRowTitles"), { count: previewStats.searchTitles })}
            </p>
          )}
          {previewStats.searchDescs > 0 && (
            <p style={theme.bullet("#a5b4fc")}>
              {fillCopy(copyText(copy, "previewRowDescs"), { count: previewStats.searchDescs })}
            </p>
          )}
          {previewStats.productDescs > 0 && (
            <p style={theme.bullet("#a5b4fc")}>
              {fillCopy(copyText(copy, "previewRowBodies"), { count: previewStats.productDescs })}
            </p>
          )}
          {previewStats.mirrorCount > 0 && (
            <p style={theme.bullet("#a5b4fc")}>
              {fillCopy(copyText(copy, "previewRowMirror"), { count: previewStats.mirrorCount })}
            </p>
          )}
          {previewStats.batchCount > 0 && (
            <p style={theme.bullet("#8b8b9a")}>
              {fillCopy(copyText(copy, "previewRowBatch"), { count: previewStats.batchCount })}
            </p>
          )}
          {previewStats.schemaWillApply && (
            <p style={theme.bullet("#a3e635")}>
              {copyText(copy, "previewRowBrand", "Brand identity for AI search")}
            </p>
          )}
          {previewStats.mirrorCount > 0 && (
            <p style={{ ...theme.body, fontSize: "0.78rem", color: "#a5b4fc", marginTop: "10px", marginBottom: 0 }}>
              {copyText(copy, "previewMirrorLegend", "★ = top seller with individual title and description polish")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function ApplyResultsCard({
  copy,
  applyResult,
  executive,
  preview,
  displayAppliedItems,
  productsUpdatedCount,
  schemaWasApplied,
  schemaOnlyOutcome,
  priorityCount,
  marketRegion,
}) {
  if (!applyResult) return null;

  const scoreBefore = applyResult?.scoreBefore ?? executive?.score;
  const scoreAfter = applyResult?.scoreAfter ?? executive?.score;
  const gain = Math.max(0, (scoreAfter ?? 0) - (scoreBefore ?? 0));
  const catalogBefore = applyResult?.catalogScoreBefore ?? executive?.catalogScore ?? 0;
  const catalogAfter = applyResult?.catalogScoreAfter ?? executive?.catalogScore ?? 0;
  const foundationBefore = applyResult?.foundationScoreBefore ?? executive?.foundationScore ?? 0;
  const foundationAfter = applyResult?.foundationScoreAfter ?? executive?.foundationScore ?? 0;
  const priorityTotal = applyResult?.priorityCount ?? priorityCount ?? 0;

  let explainKey = "resultsScoreExplainProducts";
  if (applyResult?.schemaApplied && productsUpdatedCount > 0) {
    explainKey = "resultsScoreExplainFull";
  } else if (schemaOnlyOutcome || (productsUpdatedCount === 0 && schemaWasApplied)) {
    explainKey = "resultsScoreExplainSchemaOnly";
  }

  const explain = fillTemplate(copyText(copy, explainKey, ""), {
    before: scoreBefore,
    after: scoreAfter,
    gain,
    count: priorityTotal,
    productCount: productsUpdatedCount,
    categories: applyResult?.batchCount ?? preview?.batchCount ?? 0,
  });

  return (
    <div style={{ ...theme.card, borderColor: "rgba(163,230,53,0.3)" }}>
      <h2 style={{ ...theme.h2, color: "#a3e635" }}>{copy.resultsTitle}</h2>

      {applyResult?.scoreBefore != null && applyResult?.scoreAfter != null && (
        <p style={{ ...theme.body, color: "#fff", marginBottom: "8px", fontWeight: 700, fontSize: "1.05rem" }}>
          {fillTemplate(copy.scoreImproved, { before: scoreBefore, after: scoreAfter })}
        </p>
      )}

      {explain && (
        <p style={{ ...theme.body, marginBottom: "14px", color: "#e8e8ef", lineHeight: 1.55 }}>{explain}</p>
      )}

      <p style={{ ...theme.h2, marginBottom: "4px" }}>
        {copyText(copy, "resultsScoreBreakdownTitle", "Why your score changed")}
      </p>
      <ScoreBreakdownRow
        label={fillTemplate(copyText(copy, "resultsScoreRowCatalog", "Product SEO"), { count: priorityTotal })}
        before={catalogBefore}
        after={catalogAfter}
      />
      <ScoreBreakdownRow
        label={copyText(copy, "resultsScoreRowBrand", "Brand identity for AI search")}
        before={foundationBefore}
        after={foundationAfter}
      />

      <p style={{ ...theme.h2, marginTop: "16px", marginBottom: "4px" }}>
        {copyText(copy, "resultsAppliedTitle", "What we applied")}
      </p>
      {schemaWasApplied && (
        <p style={theme.bullet("#a3e635")}>
          {fillTemplate(copyText(copy, "resultsAppliedBrand", "Brand identity saved"), {
            region: marketRegion || applyResult?.marketRegion || "your markets",
          })}
        </p>
      )}
      {productsUpdatedCount > 0 ? (
        <p style={theme.bullet("#a3e635")}>
          {fillTemplate(copyText(copy, "resultsAppliedProductsUpdated", ""), { count: productsUpdatedCount })}
        </p>
      ) : (
        <p style={theme.bullet("#a5b4fc")}>
          {fillTemplate(copyText(copy, "resultsAppliedProductsVerified", ""), { count: priorityTotal })}
        </p>
      )}

      {applyResult && (
        <p style={{ ...theme.body, fontSize: "0.82rem", color: "#8b8b9a", marginTop: "12px" }}>
          {copyText(copy, "resultsBackupNote", "Backup saved.")}
        </p>
      )}

      <AppliedProductsList items={displayAppliedItems} copy={copy} />

      {applyResult?.schemaError && (
        <p style={{ ...theme.body, color: "#fbbf24", fontSize: "0.82rem", marginTop: "10px" }}>
          {applyResult.schemaError}
        </p>
      )}
      {applyResult?.errors?.length > 0 && (
        <p style={{ ...theme.body, color: "#f87171", fontSize: "0.82rem", marginTop: "10px" }}>
          {applyResult.errors.slice(0, 2).join("; ")}
        </p>
      )}
    </div>
  );
}

function RestoreAllButton({ copy, restoreLoading, applyFetcher, style }) {
  return (
    <button
      type="button"
      style={style ?? theme.btnRestore}
      disabled={restoreLoading}
      onClick={() => {
        if (window.confirm(copy.restoreAllConfirm)) {
          applyFetcher.submit({ intent: "restore-all" }, { method: "post" });
        }
      }}
    >
      {restoreLoading ? copy.restoring : copy.restoreAll}
    </button>
  );
}

function AlreadyOptimizedCard({
  copy,
  executive,
  onViewDashboard,
  showRestore,
  restoreLoading,
  applyFetcher,
}) {
  return (
    <div style={{ ...theme.card, borderColor: "rgba(163,230,53,0.35)", background: "rgba(163,230,53,0.08)" }}>
      <h2 style={{ ...theme.h2, color: "#a3e635" }}>{copy.alreadyOptimizedTitle}</h2>
      <p style={{ ...theme.body, marginBottom: "8px", fontWeight: 600, color: "#fff" }}>
        {copy.scoreNow.replace("{{score}}", String(executive.score))}
      </p>
      <p style={{ ...theme.body, marginBottom: "14px", color: "#e8e8ef", lineHeight: 1.55 }}>
        {copy.alreadyOptimizedBody}
      </p>
      {showRestore && applyFetcher && (
        <RestoreAllButton copy={copy} restoreLoading={restoreLoading} applyFetcher={applyFetcher} />
      )}
      {onViewDashboard && (
        <button type="button" style={{ ...theme.btnGhost, width: "100%", color: "#c8c8d0" }} onClick={onViewDashboard}>
          {copy.viewScoreDashboard}
        </button>
      )}
    </div>
  );
}

const WIZARD_STORAGE_KEY = "pc_wizard_state";

function saveWizardStateForBilling() {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.setItem(WIZARD_STORAGE_KEY, JSON.stringify({ step: 3 }));
}

function readBillingReturnState() {
  if (typeof window === "undefined") {
    return { auditStarted: false, step: 1, billingJustReturned: false };
  }
  try {
    const saved = sessionStorage.getItem(WIZARD_STORAGE_KEY);
    if (saved) {
      sessionStorage.removeItem(WIZARD_STORAGE_KEY);
      const parsed = JSON.parse(saved);
      return { auditStarted: true, step: parsed.step ?? 3, billingJustReturned: false };
    }
  } catch {
    /* ignore */
  }
  const params = new URLSearchParams(window.location.search);
  const billing = params.get("billing");
  if (billing === "ready") {
    return { auditStarted: true, step: 3, billingJustReturned: true };
  }
  if (billing === "already") {
    return { auditStarted: true, step: 2, billingJustReturned: false };
  }
  return { auditStarted: false, step: 1, billingJustReturned: false };
}

function BillingDisclosureCard({ copy }) {
  return (
    <div
      style={{
        ...theme.card,
        borderColor: "rgba(251,191,36,0.45)",
        background: "rgba(251,191,36,0.08)",
        marginBottom: "14px",
      }}
    >
      <h2 style={{ ...theme.h2, color: "#fbbf24" }}>
        {copyText(copy, "billingPaymentDisclosureTitle", "What Shopify will ask you to approve")}
      </h2>
      <p style={theme.bullet("#a3e635")}>{copyText(copy, "billingPaymentStep1", "")}</p>
      <p style={theme.bullet("#6366f1")}>{copyText(copy, "billingPaymentStep2", "")}</p>
      <p style={{ ...theme.body, marginTop: "10px", marginBottom: 0, fontSize: "0.82rem", color: "#8b8b9a", lineHeight: 1.55 }}>
        {copyText(copy, "billingShopifyEmailNote", "")}
      </p>
    </div>
  );
}

function PaymentGateCard({ copy, confirmed, setConfirmed }) {
  return (
    <>
      <BillingDisclosureCard copy={copy} />
      <div style={{ ...theme.card, borderColor: "rgba(99,102,241,0.35)" }}>
      <h2 style={theme.h2}>{copy.step4FlowTitle}</h2>
      <p style={{ ...theme.body, marginBottom: "14px", color: "#e8e8ef", lineHeight: 1.55 }}>
        {copyText(copy, "step2ConfirmBeforePay", copy.step4PaymentBodyFirst)}
      </p>
      <label style={{ display: "flex", gap: "10px", alignItems: "flex-start", marginBottom: "14px", cursor: "pointer" }}>
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
          style={{ marginTop: "4px" }}
        />
        <span style={{ ...theme.body, fontSize: "0.82rem", color: "#8b8b9a" }}>{copy.confirmLabel}</span>
      </label>
      <Form
        method="post"
        style={{ margin: 0 }}
        onSubmit={() => {
          saveWizardStateForBilling();
        }}
      >
        <input type="hidden" name="intent" value="billing-setup" />
        <button type="submit" style={{ ...(confirmed ? theme.btnPrimary : theme.btnDisabled), width: "100%" }} disabled={!confirmed}>
          {copyText(copy, "unlockApply", copy.continue)}
        </button>
      </Form>
      <p style={{ ...theme.body, fontSize: "0.78rem", color: "#8b8b9a", marginTop: "12px", marginBottom: 0, lineHeight: 1.55 }}>
        {copyText(copy, "billingFootnote", "")}
      </p>
      </div>
    </>
  );
}

function PaymentSuccessBanner({ copy }) {
  return (
    <div style={{ ...theme.card, borderColor: "rgba(163,230,53,0.35)", background: "rgba(163,230,53,0.08)" }}>
      <p style={{ ...theme.body, color: "#a3e635", margin: 0, fontWeight: 600, lineHeight: 1.55 }}>
        {copyText(copy, "step4PaymentSuccess", "Payment successful — $35 setup complete.")}
      </p>
    </div>
  );
}

function Step4Actions({
  copy,
  showPaymentGate,
  showApplyGate,
  showApplyBlocked,
  confirmed,
  setConfirmed,
  applyLoading,
  applyFetcher,
  restoreLoading,
}) {
  if (showPaymentGate) {
    return <PaymentGateCard copy={copy} confirmed={confirmed} setConfirmed={setConfirmed} />;
  }

  if (showApplyGate) {
    return (
      <div style={{ ...theme.card, borderColor: "rgba(163,230,53,0.35)", background: "rgba(163,230,53,0.06)" }}>
        <p style={{ ...theme.body, marginBottom: "14px", color: "#a3e635", fontWeight: 600, lineHeight: 1.55 }}>
          {copyText(copy, "step4PaidIntro", copy.previewAwaitApply)}
        </p>
        <button
          type="button"
          style={{ ...(applyLoading ? theme.btnDisabled : theme.btnPrimary), width: "100%" }}
          disabled={applyLoading}
          onClick={() => applyFetcher.submit({ intent: "apply", confirmed: "1" }, { method: "post" })}
        >
          {applyLoading ? copy.applying : copy.apply}
        </button>
      </div>
    );
  }

  if (showApplyBlocked) {
    return (
      <div style={{ ...theme.card, borderColor: "rgba(251,191,36,0.4)", background: "rgba(251,191,36,0.08)" }}>
        <p style={{ ...theme.body, marginBottom: "12px", color: "#fbbf24", lineHeight: 1.55 }}>
          {copyText(copy, "step4RestoreToContinue", copy.applyAlreadyDone)}
        </p>
        <button
          type="button"
          style={{ ...theme.btnRestore }}
          disabled={restoreLoading}
          onClick={() => {
            if (window.confirm(copy.restoreAllConfirm)) {
              applyFetcher.submit({ intent: "restore-all" }, { method: "post" });
            }
          }}
        >
          {restoreLoading ? copy.restoring : copy.restoreAll}
        </button>
      </div>
    );
  }

  return null;
}

function PostApplyMerchantPanel({
  copy,
  applyFetcher,
  restoreLoading,
  backupAvailable,
  showUndoLast,
  onViewDashboard,
  deliveryStatus,
  shop,
  onRecheckDelivery,
  recheckingDelivery = false,
}) {
  const ready = deliveryStatus?.crawlerReady;
  return (
    <>
      {!ready && (
        <div style={{ ...theme.card, borderColor: "rgba(251,191,36,0.45)", background: "rgba(251,191,36,0.06)" }}>
          <p style={{ ...theme.body, fontSize: "0.78rem", color: "#fbbf24", margin: "0 0 8px 0", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" }}>
            {copyText(copy, "deliveryOptionalNote", "Optional merchant setup")}
          </p>
          <h2 style={{ ...theme.h2, color: "#fbbf24", marginBottom: "8px" }}>
            {copyText(copy, "postApplyManualTitle", "Recommended — improve live crawler visibility")}
          </h2>
          <p style={{ ...theme.body, marginBottom: "14px", fontSize: "0.88rem", color: "#c8c8d0", lineHeight: 1.55 }}>
            {copyText(copy, "postApplyManualBody", "")}
          </p>
          <ThemeOnboardingPanel copy={copy} shop={shop} deliveryStatus={deliveryStatus} />
          <DeliveryChecklistPanel
            copy={copy}
            deliveryStatus={deliveryStatus}
            shop={shop}
            onRecheck={onRecheckDelivery}
            rechecking={recheckingDelivery}
          />
        </div>
      )}
      <div style={{ ...theme.card, borderColor: ready ? "rgba(163,230,53,0.35)" : "rgba(251,191,36,0.45)", background: ready ? "rgba(163,230,53,0.06)" : "rgba(251,191,36,0.08)" }}>
        <h2 style={{ ...theme.h2, color: ready ? "#a3e635" : "#fbbf24" }}>
          {copyText(copy, ready ? "postApplyTitle" : "postApplyAlmostTitle", "Optimization complete")}
        </h2>
        <p style={{ ...theme.body, marginBottom: "14px", color: "#e8e8ef", lineHeight: 1.55 }}>
          {copyText(copy, ready ? "postApplyBody" : "postApplyThemeRequired", "")}
        </p>
        <button
          type="button"
          style={{ ...theme.btnPrimary, width: "100%", marginBottom: "10px" }}
          onClick={onViewDashboard}
        >
          {copyText(copy, "viewDashboard", copy.viewScoreDashboard)}
        </button>
      {backupAvailable && (
        <>
          <RestoreAllButton
            copy={copy}
            restoreLoading={restoreLoading}
            applyFetcher={applyFetcher}
            style={{ ...theme.btnRestore, marginBottom: "10px" }}
          />
          {showUndoLast && (
            <button
              type="button"
              style={{ ...theme.btnGhost, width: "100%", marginBottom: "10px" }}
              disabled={restoreLoading}
              onClick={() => {
                if (window.confirm(copyText(copy, "restoreLastConfirm", copy.restoreWarning))) {
                  applyFetcher.submit({ intent: "restore" }, { method: "post" });
                }
              }}
            >
              {restoreLoading ? copy.restoring : copy.restore}
            </button>
          )}
        </>
      )}
      <p style={{ ...theme.body, fontSize: "0.78rem", color: "#8b8b9a", margin: "8px 0 0 0", lineHeight: 1.55 }}>
        {copyText(copy, "restoreAllHint", "")}
      </p>
      {showUndoLast && (
        <p style={{ ...theme.body, fontSize: "0.78rem", color: "#8b8b9a", margin: "6px 0 0 0", lineHeight: 1.55 }}>
          {copyText(copy, "restoreLastHint", copy.restoreWarning)}
        </p>
      )}
    </div>
    </>
  );
}

function GrowthHubBanner({ locale }) {
  const es = locale === "es";
  const hubUrl = "https://predictacore.ai/ads/clients/pam-andander/growth";
  return (
    <a
      href={hubUrl}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: "block",
        marginBottom: "16px",
        padding: "14px 16px",
        borderRadius: "12px",
        background: "rgba(99,102,241,0.15)",
        border: "1px solid rgba(99,102,241,0.35)",
        color: "#c7d2fe",
        textDecoration: "none",
        fontWeight: 700,
        fontSize: "0.88rem",
      }}
    >
      {es
        ? "Centro de inteligencia → Meta + Shopify + Google + AI"
        : "Intelligence hub → Meta + Shopify + Google + AI"}
    </a>
  );
}

function IntroScreen({ copy, shopName, onStart, showGrowthHub, locale }) {
  return (
    <div style={theme.page}>
      {showGrowthHub && <GrowthHubBanner locale={locale} />}
      <header style={{ marginBottom: "20px" }}>
        <p style={{ margin: 0, fontSize: "0.75rem", color: "#6366f1", fontWeight: 600, letterSpacing: "0.06em" }}>
          {copy.subtitle}
        </p>
        <h1 style={{ margin: "4px 0 0 0", fontSize: "1.35rem", fontWeight: 700, color: "#fff" }}>
          {copy.title}
        </h1>
        {shopName && (
          <p style={{ margin: "6px 0 0 0", fontSize: "0.82rem", color: "#6b6b78" }}>{shopName}</p>
        )}
      </header>

      <div style={{ ...theme.card, borderColor: "rgba(99,102,241,0.35)", background: "rgba(99,102,241,0.08)" }}>
        <h2 style={{ ...theme.h2, color: "#a5b4fc" }}>{copy.introTitle}</h2>
        <p style={{ ...theme.body, marginBottom: "10px", color: "#a3e635", fontWeight: 600, lineHeight: 1.55 }}>
          {copyText(copy, "introBenefitTitle", "What you gain")}
        </p>
        <p style={{ ...theme.body, marginBottom: "14px", color: "#e8e8ef", lineHeight: 1.6 }}>
          {copyText(copy, "introBenefitLead", "")}
        </p>
        <p style={{ ...theme.body, marginBottom: "14px", color: "#c8c8d0", lineHeight: 1.6 }}>{copy.introBody}</p>
        <p style={theme.bullet("#a5b4fc")}>{copy.introBullet1}</p>
        <p style={theme.bullet("#a5b4fc")}>{copy.introBullet2}</p>
        <p style={theme.bullet("#a5b4fc")}>{copy.introBullet3}</p>
        <p style={{ ...theme.body, marginTop: "14px", fontSize: "0.82rem", color: "#8b8b9a", lineHeight: 1.55 }}>
          {copy.introNoChanges}
        </p>
      </div>

      <div style={{ ...theme.card, borderColor: "rgba(99,102,241,0.25)" }}>
        <h2 style={theme.h2}>{copy.pricingTitle}</h2>
        <p style={theme.bullet("#a3e635")}>{copy.pricingFree}</p>
        <p style={theme.bullet("#a5b4fc")}>{copy.pricingScope}</p>
        <p style={theme.bullet("#a5b4fc")}>{copy.pricingSetup}</p>
        <p style={{ ...theme.body, marginTop: "10px", fontSize: "0.82rem", color: "#8b8b9a", lineHeight: 1.55 }}>
          {copy.pricingExtra}
        </p>
        <p style={{ ...theme.body, marginTop: "10px", fontSize: "0.82rem", color: "#fbbf24", lineHeight: 1.55 }}>
          {copy.pricingRecurringNote}
        </p>
      </div>

      <button type="button" style={theme.btnPrimary} onClick={onStart}>
        {copy.startAuditButton}
      </button>
    </div>
  );
}

function ExpectationsPanel({
  copy,
  priorityCount,
  productsUpdatedCount = 0,
  schemaOnlyOutcome = false,
  schemaWasApplied = false,
  showMaintenance = true,
  variant = "post",
  maintenanceLimit = 500,
  skipAppliedSection = false,
}) {
  const count = String(priorityCount);
  const limit = String(maintenanceLimit);
  const fill = (text) => text.replace("{{count}}", count);
  const fillLimit = (text) => fillCopy(text, { limit, count });
  const isPreview = variant === "preview";
  const title = isPreview
    ? copyText(copy, "expectationsPreviewTitle", copy.expectationsTitle)
    : copy.expectationsTitle;

  const means1 = isPreview
    ? copyText(copy, "expectationsPreviewMeans1", copy.expectationsMeans1)
    : copy.expectationsMeans1;
  const means2 = isPreview
    ? fill(copyText(copy, "expectationsPreviewMeans2", copy.expectationsMeans2))
    : schemaOnlyOutcome
      ? copyText(copy, "expectationsMeans2ProductsDone", copy.expectationsMeans2)
      : fill(copy.expectationsMeans2);
  const not1 = isPreview ? copyText(copy, "expectationsPreviewNot1", copy.expectationsNot1) : copy.expectationsNot1;
  const not2 = isPreview ? copyText(copy, "expectationsPreviewNot2", copy.expectationsNot2) : copy.expectationsNot2;
  const timeline1 = isPreview
    ? copyText(copy, "expectationsPreviewTimeline1", copy.expectationsTimeline1)
    : copy.expectationsTimeline1;
  const timeline2 = isPreview
    ? copyText(copy, "expectationsPreviewTimeline2", copy.expectationsTimeline2)
    : copy.expectationsTimeline2;

  return (
    <div style={{ ...theme.card, borderColor: "rgba(163,230,53,0.35)", background: "rgba(163,230,53,0.06)" }}>
      <h2 style={{ ...theme.h2, color: "#a3e635" }}>{title}</h2>

      <p style={{ ...theme.h2, marginTop: "16px" }}>{copy.expectationsMeansTitle}</p>
      <p style={theme.bullet("#a3e635")}>{means1}</p>
      <p style={theme.bullet("#a3e635")}>{means2}</p>

      <p style={{ ...theme.h2, marginTop: "16px" }}>{copy.expectationsNotTitle}</p>
      <p style={theme.bullet("#fbbf24")}>{not1}</p>
      <p style={theme.bullet("#fbbf24")}>{not2}</p>

      {!isPreview && !skipAppliedSection && (
        <>
          <p style={{ ...theme.h2, marginTop: "16px" }}>{copy.expectationsDoneTitle}</p>
          <p style={theme.bullet("#a5b4fc")}>
            {productsUpdatedCount > 0
              ? fillTemplate(copyText(copy, "expectationsDone1Updated", copy.expectationsDone2), {
                  count: productsUpdatedCount,
                })
              : fillTemplate(copyText(copy, "expectationsDone1Verified", copy.expectationsDone2), {
                  count: priorityCount,
                })}
          </p>
          {productsUpdatedCount > 0 && (
            <p style={theme.bullet("#a5b4fc")}>{copy.expectationsDone2}</p>
          )}
          {schemaWasApplied && (
            <p style={theme.bullet("#a5b4fc")}>{copy.expectationsDone3}</p>
          )}
          <p style={theme.bullet("#a5b4fc")}>{copy.expectationsDone4}</p>
        </>
      )}

      <p style={{ ...theme.h2, marginTop: "16px" }}>{copy.expectationsTimelineTitle}</p>
      <p style={theme.bullet("#8b8b9a")}>{timeline1}</p>
      <p style={theme.bullet("#8b8b9a")}>{timeline2}</p>

      {isPreview && (
        <>
          <p style={{ ...theme.h2, marginTop: "16px" }}>
            {copyText(copy, "expectationsPreviewMaintenanceTitle", copy.maintenancePlanTitle)}
          </p>
          <p style={theme.bullet("#6366f1")}>
            {fillLimit(copyText(copy, "expectationsPreviewMaintenance1", copy.maintenancePlan1))}
          </p>
          <p style={theme.bullet("#6366f1")}>{copyText(copy, "expectationsPreviewMaintenance2", "")}</p>
          <p style={theme.bullet("#6366f1")}>{copyText(copy, "expectationsPreviewMaintenance3", "")}</p>
        </>
      )}

      {showMaintenance && !isPreview && (
        <>
          <p style={{ ...theme.h2, marginTop: "16px" }}>{copy.maintenancePlanTitle}</p>
          <p style={{ ...theme.body, fontSize: "0.88rem", marginBottom: "8px" }}>{copy.maintenancePlanIntro}</p>
          <p style={theme.bullet("#6366f1")}>{fillLimit(copy.maintenancePlan1)}</p>
          <p style={theme.bullet("#6366f1")}>{copy.maintenancePlan2}</p>
          <p style={theme.bullet("#6366f1")}>{copy.maintenancePlan3}</p>
          <p style={{ ...theme.body, fontSize: "0.82rem", color: "#8b8b9a", marginTop: "10px" }}>
            {copy.maintenancePlanNote}
          </p>
        </>
      )}
    </div>
  );
}

export default function Index() {
  const { shop: shellShop, introCopy, showGrowthHub, locale: shellLocale } = useLoaderData();
  const auditFetcher = useFetcher();
  const aiFetcher = useFetcher();
  const applyFetcher = useFetcher();
  const summarySubmitStarted = useRef(false);
  const billingReturn = readBillingReturnState();
  const [step, setStep] = useState(billingReturn.step);
  const [summaryTimedOut, setSummaryTimedOut] = useState(false);
  const [auditStarted, setAuditStarted] = useState(billingReturn.auditStarted);
  const [billingJustReturned, setBillingJustReturned] = useState(billingReturn.billingJustReturned);
  const [aiRequested, setAiRequested] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [summaryInvalidated, setSummaryInvalidated] = useState(false);
  const totalSteps = 3;
  const auditDataUrl = (recheckDelivery = false) =>
    recheckDelivery ? "/app/audit-data?recheckDelivery=1" : "/app/audit-data";

  const startAudit = () => {
    setAuditStarted(true);
    auditFetcher.load(auditDataUrl());
  };

  useEffect(() => {
    if (auditStarted && !auditFetcher.data && auditFetcher.state === "idle") {
      auditFetcher.load(auditDataUrl());
    }
  }, [auditStarted, auditFetcher.data, auditFetcher.state]);

  const audit = auditFetcher.data;
  const auditPending = !audit;
  const auditReloading = Boolean(audit) && auditFetcher.state === "loading";

  const {
    shop = shellShop,
    shopName,
    error,
    copy,
    executive,
    snapshot,
    report,
    preview,
    appliedCatalog = [],
    hasBackup,
    backupBatchCount,
    backupSummary,
    billing,
    uninstallRestorePreference = "restore",
    aiSummaryAvailable = false,
    marketContext,
    validation,
    canPilotReset = false,
    productTier,
    benchmark,
    applyImpact,
    marketsWatch,
    searchConsole,
    deliveryStatus,
  } = audit ?? {};

  const summary = aiFetcher.data?.intent === "summary" && !summaryInvalidated
    ? aiFetcher.data.summary
    : null;
  const summaryError = aiFetcher.data?.intent === "summary" && !summaryInvalidated
    ? aiFetcher.data.summaryError
    : null;
  const summaryLoading = aiFetcher.state !== "idle" && aiFetcher.formData?.get("intent") === "summary";
  const awaitingSummary =
    aiSummaryAvailable &&
    !summaryInvalidated &&
    !summary &&
    !summaryError &&
    !summaryTimedOut;

  const applyResult = applyFetcher.data?.intent === "apply" ? applyFetcher.data.applyResult : null;
  const applyError = applyFetcher.data?.intent === "apply" ? applyFetcher.data.applyError : null;
  const applyLoading = applyFetcher.state !== "idle" && applyFetcher.formData?.get("intent") === "apply";
  const optimizingOverlay = applyLoading || (Boolean(applyResult) && auditReloading);

  const restoreResult =
    applyFetcher.data?.intent === "restore" || applyFetcher.data?.intent === "restore-all"
      ? applyFetcher.data.restoreResult
      : null;
  const restoreError =
    applyFetcher.data?.intent === "restore" || applyFetcher.data?.intent === "restore-all"
      ? applyFetcher.data.restoreError
      : null;
  const restoreLoading =
    applyFetcher.state !== "idle" &&
    (applyFetcher.formData?.get("intent") === "restore" ||
      applyFetcher.formData?.get("intent") === "restore-all" ||
      applyFetcher.formData?.get("intent") === "reset-test-store");

  const resetTestResult =
    applyFetcher.data?.intent === "reset-test-store" ? applyFetcher.data.resetTestResult : null;
  const resetTestError =
    applyFetcher.data?.intent === "reset-test-store" ? applyFetcher.data.resetTestError : null;

  const backupAvailable = hasBackup || applyFetcher.data?.hasBackup;
  const firstApplyDone = Boolean(billing?.applyQuota?.setupDone);
  const restoreAvailable =
    backupAvailable || Boolean(backupSummary?.hasBaseline) || Boolean(backupSummary?.hasActiveBackup) || firstApplyDone;
  const setupComplete = Boolean(
    preview &&
      executive &&
      preview.total === 0 &&
      executive.score >= 85 &&
      backupAvailable &&
      firstApplyDone,
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const billingParam = params.get("billing");

    if (billingParam === "ready") {
      setAuditStarted(true);
      setBillingJustReturned(true);
      setStep(2);
      auditFetcher.load(auditDataUrl());
      params.delete("billing");
      params.delete("charge_id");
      const qs = params.toString();
      window.history.replaceState({}, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
      return;
    }

    if (billingParam === "already") {
      setAuditStarted(true);
      setBillingJustReturned(false);
      setStep(2);
      auditFetcher.load(auditDataUrl());
      params.delete("billing");
      const qs = params.toString();
      window.history.replaceState({}, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
    }
  }, [auditFetcher]);

  useEffect(() => {
    if (applyFetcher.data?.intent === "confirm-markets" && applyFetcher.data?.marketConfirmed) {
      auditFetcher.load(auditDataUrl());
    }
  }, [applyFetcher.data?.intent, applyFetcher.data?.marketConfirmed]);

  useEffect(() => {
    if (applyFetcher.data?.intent === "apply" && applyFetcher.data?.applyResult) {
      setBillingJustReturned(false);
      setSummaryInvalidated(true);
      setConfirmed(false);
      setStep(3);
      auditFetcher.load(auditDataUrl());
    }
  }, [applyFetcher.data]);

  useEffect(() => {
    if (restoreResult != null) {
      setSummaryInvalidated(true);
      setConfirmed(false);
      setAiRequested(false);
      setBillingJustReturned(false);
      summarySubmitStarted.current = false;
      setSummaryTimedOut(false);
      setStep(1);
      auditFetcher.load(auditDataUrl());
    }
  }, [restoreResult]);

  useEffect(() => {
    if (resetTestResult) {
      setSummaryInvalidated(true);
      setConfirmed(false);
      setStep(1);
      auditFetcher.load(auditDataUrl());
    }
  }, [resetTestResult]);

  useEffect(() => {
    if (auditPending || !aiSummaryAvailable || summaryInvalidated) return;
    if (summary || summaryError) return;
    if (summarySubmitStarted.current) return;
    if (aiFetcher.state !== "idle") return;
    summarySubmitStarted.current = true;
    setSummaryTimedOut(false);
    aiFetcher.submit({ intent: "summary" }, { method: "post" });
  }, [auditPending, aiSummaryAvailable, summaryInvalidated, summary, summaryError, aiFetcher.state]);

  useEffect(() => {
    if (!summaryLoading) return;
    const timer = window.setTimeout(() => setSummaryTimedOut(true), 55000);
    return () => window.clearTimeout(timer);
  }, [summaryLoading]);

  const retryAiSummary = () => {
    summarySubmitStarted.current = false;
    setSummaryTimedOut(false);
    setAiRequested(true);
  };

  const requestAiSummary = () => {
    summarySubmitStarted.current = false;
    setSummaryTimedOut(false);
    setAiRequested(true);
  };

  if (!auditStarted) {
    return (
      <IntroScreen
        copy={introCopy}
        shopName={shellShop?.replace(".myshopify.com", "")}
        onStart={startAudit}
        showGrowthHub={showGrowthHub}
        locale={shellLocale}
      />
    );
  }

  if (auditPending || awaitingSummary) {
    return (
      <LoadingShell
        title={introCopy?.title ?? "PredictaCore"}
        eyebrow={introCopy?.subtitle ?? "AI visibility audit"}
        message={
          auditPending
            ? introCopy?.loading ?? "Analyzing your store…"
            : copy?.loadingAiSummary ?? introCopy?.loadingAiSummary ?? "Writing your personalized AI summary…"
        }
        subtext={
          auditPending
            ? introCopy?.loadingAuditSubtext ?? "Read-only scan — nothing on your store is modified yet."
            : copy?.loadingAiSummarySubtext ??
              introCopy?.loadingAiSummarySubtext ??
              "Usually 10–20 seconds. Your score and action plan appear when this finishes."
        }
        mode="audit"
      />
    );
  }

  if (error || !copy || !executive || !snapshot || !report || !preview) {
    const auditErr = auditErrorCopy(error, copy, introCopy);
    return (
      <AppErrorShell
        message={auditErr?.message || error || copy?.error || "Unable to load store data"}
        hint={auditErr?.hint || (shop ? `Store: ${shop}` : undefined)}
        onRetry={() => auditFetcher.load(auditDataUrl())}
      />
    );
  }

  return (
    <>
      {showGrowthHub && (
        <div style={{ padding: "12px 16px 0", maxWidth: 960, margin: "0 auto" }}>
          <GrowthHubBanner locale={shellLocale} />
        </div>
      )}
      {optimizingOverlay && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 100,
            background: "rgba(12,12,20,0.92)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "24px",
          }}
        >
          <LoadingShell
            title={copy?.title ?? introCopy?.title ?? "PredictaCore"}
            eyebrow={copy?.subtitle ?? introCopy?.subtitle ?? "AI visibility audit"}
            message={copy?.optimizingStore ?? introCopy?.optimizingStore ?? "We are optimizing your store and products"}
            subtext={copy?.optimizingStoreSubtext ?? introCopy?.optimizingStoreSubtext ?? ""}
            mode="optimize"
          />
        </div>
      )}
      {restoreLoading && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 100,
            background: "rgba(12,12,20,0.92)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "24px",
          }}
        >
          <LoadingShell message={copy?.restoring ?? "Restoring…"} />
        </div>
      )}
      <IndexWizard
        shop={shop}
        shopName={shopName}
        copy={copy}
        executive={executive}
        snapshot={snapshot}
        report={report}
        preview={preview}
        appliedCatalog={appliedCatalog}
        setupComplete={setupComplete}
        hasBackup={hasBackup}
        backupBatchCount={backupBatchCount}
        backupSummary={backupSummary}
        billing={billing}
        step={step}
        setStep={setStep}
        confirmed={confirmed}
        setConfirmed={setConfirmed}
        summaryInvalidated={summaryInvalidated}
        totalSteps={totalSteps}
        aiFetcher={aiFetcher}
        applyFetcher={applyFetcher}
        aiRequested={aiRequested}
        aiSummaryAvailable={aiSummaryAvailable}
        onRequestAiSummary={requestAiSummary}
        summary={summary}
        summaryError={summaryError}
        summaryTimedOut={summaryTimedOut}
        summaryLoading={summaryLoading}
        onRetryAiSummary={retryAiSummary}
        applyResult={applyResult}
        applyError={applyError}
        applyLoading={applyLoading}
        restoreResult={restoreResult}
        restoreError={restoreError}
        restoreLoading={restoreLoading}
        resetTestResult={resetTestResult}
        resetTestError={resetTestError}
        backupAvailable={backupAvailable}
        restoreAvailable={restoreAvailable}
        uninstallRestorePreference={uninstallRestorePreference}
        billingJustReturned={billingJustReturned}
        auditReloading={auditReloading}
        marketContext={marketContext}
        validation={validation}
        canPilotReset={canPilotReset}
        productTier={productTier}
        benchmark={benchmark}
        applyImpact={applyImpact}
        marketsWatch={marketsWatch}
        searchConsole={searchConsole}
        deliveryStatus={deliveryStatus}
        auditFetcher={auditFetcher}
        auditDataUrl={auditDataUrl}
      />
    </>
  );
}

function OptimizedDashboardActions({
  copy,
  applyFetcher,
  restoreLoading,
  backupBatchCount,
  canPilotReset,
  restoreResult,
  restoreError,
  applyFetcherIntent,
}) {
  return (
    <div style={{ ...theme.card, borderColor: "rgba(251,191,36,0.55)", background: "rgba(251,191,36,0.1)" }}>
      <h2 style={{ ...theme.h2, color: "#fbbf24" }}>{copyText(copy, "dashboardActionsTitle", "Restore or re-test")}</h2>
      <p style={{ ...theme.body, marginBottom: "14px", fontSize: "0.88rem", lineHeight: 1.55 }}>
        {copyText(copy, "dashboardActionsBody", "")}
      </p>
      <RestoreAllButton copy={copy} restoreLoading={restoreLoading} applyFetcher={applyFetcher} />
      {backupBatchCount > 1 && (
        <button
          type="button"
          style={{ ...theme.btnGhost, width: "100%", marginTop: "10px", color: "#c8c8d0" }}
          disabled={restoreLoading}
          onClick={() => {
            if (window.confirm(copyText(copy, "restoreLastConfirm", copy.restoreWarning))) {
              applyFetcher.submit({ intent: "restore" }, { method: "post" });
            }
          }}
        >
          {restoreLoading ? copy.restoring : copy.restore}
        </button>
      )}
      {canPilotReset && (
        <button
          type="button"
          style={{ ...theme.btnGhost, width: "100%", marginTop: "10px", borderColor: "rgba(251,191,36,0.5)", color: "#fbbf24" }}
          disabled={restoreLoading}
          onClick={() => {
            if (window.confirm(copyText(copy, "resetTestConfirm", "Reset test store?"))) {
              applyFetcher.submit({ intent: "reset-test-store" }, { method: "post" });
            }
          }}
        >
          {restoreLoading
            ? copyText(copy, "resetTestLoading", "Resetting…")
            : copyText(copy, "resetTestTitle", "Reset demo store")}
        </button>
      )}
      {restoreResult && (
        <p style={{ ...theme.body, color: "#a3e635", marginTop: "12px", marginBottom: 0 }}>
          {formatRestoreMessage(copy, applyFetcherIntent, restoreResult)}
        </p>
      )}
      {restoreError && (
        <p style={{ ...theme.body, color: "#f87171", marginTop: "12px", marginBottom: 0 }}>{restoreError}</p>
      )}
    </div>
  );
}

function UninstallPreferencePanel({
  copy,
  preference,
  applyFetcher,
  saving,
  saved,
  preferenceError,
}) {
  const optionStyle = (active) => ({
    display: "block",
    padding: "12px 14px",
    marginBottom: "10px",
    borderRadius: "10px",
    border: active ? "1px solid rgba(99,102,241,0.55)" : "1px solid rgba(255,255,255,0.1)",
    background: active ? "rgba(99,102,241,0.12)" : "rgba(255,255,255,0.03)",
    cursor: saving ? "wait" : "pointer",
  });

  const select = (value) => {
    if (saving || preference === value) return;
    applyFetcher.submit({ intent: "set-uninstall-preference", preference: value }, { method: "post" });
  };

  return (
    <div style={{ ...theme.card, borderColor: "rgba(99,102,241,0.35)", background: "rgba(99,102,241,0.06)" }}>
      <h2 style={{ ...theme.h2, color: "#a5b4fc" }}>{copyText(copy, "uninstallPrefTitle", "If you uninstall")}</h2>
      <p style={{ ...theme.body, fontSize: "0.88rem", marginBottom: "10px" }}>
        {copyText(copy, "uninstallPrefIntro", "")}
      </p>
      <p style={{ ...theme.body, fontSize: "0.82rem", color: "#fbbf24", marginBottom: "14px", lineHeight: 1.5 }}>
        {copyText(copy, "uninstallPrefNotNowNote", "")}
      </p>
      <label style={optionStyle(preference === "restore")}>
        <input
          type="radio"
          name="uninstall-pref"
          checked={preference === "restore"}
          onChange={() => select("restore")}
          disabled={saving}
          style={{ marginRight: "8px" }}
        />
        <strong style={{ color: "#e8e8ef" }}>{copyText(copy, "uninstallPrefRestoreLabel", "Restore")}</strong>
        <span style={{ display: "block", marginTop: "6px", fontSize: "0.82rem", color: "#8b8b9a" }}>
          {copyText(copy, "uninstallPrefRestoreBody", "")}
        </span>
      </label>
      <label style={optionStyle(preference === "keep")}>
        <input
          type="radio"
          name="uninstall-pref"
          checked={preference === "keep"}
          onChange={() => select("keep")}
          disabled={saving}
          style={{ marginRight: "8px" }}
        />
        <strong style={{ color: "#e8e8ef" }}>{copyText(copy, "uninstallPrefKeepLabel", "Keep")}</strong>
        <span style={{ display: "block", marginTop: "6px", fontSize: "0.82rem", color: "#8b8b9a" }}>
          {copyText(copy, "uninstallPrefKeepBody", "")}
        </span>
      </label>
      {saved && (
        <p style={{ ...theme.body, color: "#a3e635", fontSize: "0.82rem", margin: "8px 0 0 0" }}>
          {copyText(copy, "uninstallPrefSaved", "Saved.")}
        </p>
      )}
      {preferenceError && (
        <p style={{ ...theme.body, color: "#f87171", fontSize: "0.82rem", margin: "8px 0 0 0" }}>{preferenceError}</p>
      )}
      <p style={{ ...theme.body, fontSize: "0.78rem", color: "#6b6b78", margin: "12px 0 0 0", lineHeight: 1.5 }}>
        {copyText(copy, "uninstallPrefSteps", "")}
      </p>
    </div>
  );
}

function AppliedProductsList({ items, copy, titleKey = "resultsProductsTitle" }) {
  if (!items?.length) return null;

  return (
    <div style={{ marginTop: "12px" }}>
      <p style={{ ...theme.body, fontSize: "0.82rem", color: "#a5b4fc", marginBottom: "8px", fontWeight: 600 }}>
        {copyText(copy, titleKey, "Every product we updated")}
      </p>
      <ul style={{ margin: 0, paddingLeft: "18px", maxHeight: "280px", overflowY: "auto" }}>
        {items.map((item) => (
          <li key={item.title} style={{ ...theme.body, fontSize: "0.8rem", color: "#c8c8d0", marginBottom: "6px" }}>
            <strong style={{ color: "#fff" }}>{item.title}</strong>
            {item.changes?.length > 0 && (
              <span style={{ color: "#a3e635" }}> — {item.changes.join(" · ")}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function BackupStatusPanel({ copy, backupSummary }) {
  if (!backupSummary) return null;

  const schemaSuffix = backupSummary.hasSchemaBackup
    ? copyText(copy, "backupStatusSchema", " + brand identity")
    : "";

  let bodyKey = "backupStatusNone";
  const vars = { products: "0", batches: "0", schema: schemaSuffix };

  if (backupSummary.hasActiveBackup) {
    bodyKey = "backupStatusApply";
    vars.products = String(backupSummary.applyProductCount ?? 0);
    vars.batches = String(backupSummary.applyBatchCount ?? 0);
    vars.schema = schemaSuffix;
  } else if (backupSummary.hasBaseline) {
    bodyKey = "backupStatusBaseline";
    vars.products = String(backupSummary.baselineProductCount ?? 0);
  }

  return (
    <>
      {backupSummary.baselineMissing && (
        <div style={{ ...theme.card, borderColor: "rgba(251,191,36,0.45)", background: "rgba(251,191,36,0.08)", marginBottom: "14px" }}>
          <h2 style={{ ...theme.h2, color: "#fbbf24", fontSize: "0.95rem" }}>
            {copyText(copy, "baselineMissingTitle", "Original backup missing")}
          </h2>
          <p style={{ ...theme.body, fontSize: "0.82rem", color: "#e8e8ef", margin: 0, lineHeight: 1.55 }}>
            {copyText(copy, "baselineMissingBody", "")}
          </p>
        </div>
      )}
      <div style={{ ...theme.card, borderColor: "rgba(255,255,255,0.08)" }}>
        <h2 style={{ ...theme.h2, fontSize: "0.95rem" }}>{copyText(copy, "backupStatusTitle", "Backup status")}</h2>
        <p style={{ ...theme.body, fontSize: "0.82rem", color: "#8b8b9a", margin: 0, lineHeight: 1.55 }}>
          {fillCopy(copyText(copy, bodyKey, ""), vars)}
        </p>
      </div>
    </>
  );
}

function MarketsPanel({ copy, marketContext, applyFetcher }) {
  const NORTH_AMERICA = ["US", "CA", "MX"];
  const available = sortMarketCountries(marketContext?.countries ?? [], NORTH_AMERICA);

  const defaultSelected = () => {
    const codes = available.map((c) => c.code);
    const preferred = NORTH_AMERICA.filter((c) => codes.includes(c));
    if (preferred.length) return preferred;
    if (marketContext?.countryCodes?.length) return marketContext.countryCodes;
    return codes.slice(0, 1);
  };

  const savedCount = marketContext?.countryCodes?.length ?? 0;
  const tooBroad = marketContext?.confirmed && savedCount > 5;

  const [editing, setEditing] = useState(!marketContext?.confirmed || tooBroad);
  const [selected, setSelected] = useState(defaultSelected);

  const confirming =
    applyFetcher.state !== "idle" && applyFetcher.formData?.get("intent") === "confirm-markets";
  const justConfirmed =
    applyFetcher.data?.intent === "confirm-markets" && applyFetcher.data?.marketConfirmed;
  const confirmed = (marketContext?.confirmed || justConfirmed) && !editing;
  const showPicker = !confirmed;

  useEffect(() => {
    if (!marketContext?.confirmed || tooBroad) {
      setEditing(true);
      setSelected(defaultSelected());
    } else if (marketContext.countryCodes?.length) {
      setSelected(marketContext.countryCodes);
    }
  }, [marketContext?.confirmed, marketContext?.countryCodes?.join(","), tooBroad]);

  const region =
    applyFetcher.data?.regionLabel ?? marketContext?.regionLabel ?? copyText(copy, "marketsNotConfigured");

  const mexicoMissing = !available.some((c) => c.code === "MX");

  const toggleCode = (code) => {
    setSelected((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));
  };

  const applyPreset = (codes) => {
    const allowed = codes.filter((c) => available.some((a) => a.code === c));
    setSelected(allowed.length ? allowed : defaultSelected());
    setEditing(true);
  };

  const submitConfirm = () => {
    applyFetcher.submit(
      { intent: "confirm-markets", countryCodes: selected.join(",") },
      { method: "post" },
    );
  };

  const selectedLabels = formatRegionLabelFromCodes(selected, available);

  return (
    <div
      style={{
        ...theme.card,
        borderColor: confirmed ? "rgba(163,230,53,0.35)" : "rgba(99,102,241,0.35)",
        background: confirmed ? "rgba(163,230,53,0.06)" : "rgba(99,102,241,0.08)",
      }}
    >
      <h2 style={{ ...theme.h2, color: confirmed ? "#a3e635" : "#a5b4fc" }}>
        {copyText(copy, "marketsPanelTitle", "Where you sell")}
      </h2>
      <p style={{ ...theme.body, marginBottom: "10px" }}>
        {copyText(copy, "marketsPanelBody", "")}
      </p>
      {showPicker && (
        <p style={{ ...theme.body, fontSize: "0.82rem", color: "#fbbf24", marginBottom: "10px", lineHeight: 1.55 }}>
          {copyText(copy, "marketsChangeWarning", "")}
        </p>
      )}
      {marketContext?.configured ? (
        <>
          {showPicker && (
            <p style={{ ...theme.body, fontSize: "0.82rem", color: "#a5b4fc", marginBottom: "10px" }}>
              {copyText(copy, "marketsSelectHint", "")}
            </p>
          )}
          <p style={{ ...theme.body, color: "#e8e8ff", fontWeight: 600, marginBottom: "6px" }}>
            {confirmed
              ? fillCopy(copyText(copy, "marketsConfirmed", ""), { region })
              : fillCopy(copyText(copy, "marketsDetected", ""), { region: selectedLabels })}
          </p>
          {showPicker && available.length > 0 && (
            <>
              {mexicoMissing && (
                <p style={{ ...theme.body, fontSize: "0.82rem", color: "#fbbf24", marginBottom: "10px" }}>
                  {copyText(copy, "marketsAddMexicoHint", "")}
                </p>
              )}
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "12px" }}>
                <button
                  type="button"
                  style={{ ...theme.btnGhost, fontSize: "0.78rem", padding: "6px 10px" }}
                  onClick={() => applyPreset(NORTH_AMERICA)}
                >
                  {copyText(copy, "marketsPresetNorthAmerica", "US, Canada & Mexico only")}
                </button>
              </div>
              <p style={{ ...theme.body, fontSize: "0.78rem", color: "#8b8b9a", marginBottom: "8px" }}>
                {fillCopy(copyText(copy, "marketsAvailableList", "Shopify lists {{count}} countries — check only where you sell:"), {
                  count: String(available.length),
                })}
              </p>
              <div
                style={{
                  maxHeight: "280px",
                  overflowY: "auto",
                  marginBottom: "12px",
                  padding: "8px",
                  borderRadius: "8px",
                  border: "1px solid rgba(255,255,255,0.08)",
                }}
              >
                {available.map((c) => (
                  <label
                    key={c.code}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      padding: "4px 0",
                      fontSize: "0.82rem",
                      color: NORTH_AMERICA.includes(c.code) ? "#e8e8ff" : "#8b8b9a",
                      cursor: "pointer",
                      fontWeight: NORTH_AMERICA.includes(c.code) ? 600 : 400,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selected.includes(c.code)}
                      onChange={() => toggleCode(c.code)}
                    />
                    {c.name} ({c.code})
                  </label>
                ))}
              </div>
            </>
          )}
          {confirmed && !editing && selected.length > 0 && (
            <p style={{ ...theme.body, fontSize: "0.82rem", color: "#8b8b9a", marginBottom: "12px" }}>
              {fillCopy(copyText(copy, "marketsCountries", ""), {
                countries: formatRegionLabelFromCodes(
                  marketContext?.countryCodes ?? selected,
                  available,
                ),
              })}
            </p>
          )}
        </>
      ) : (
        <p style={{ ...theme.body, color: "#fbbf24", marginBottom: "12px" }}>
          {copyText(copy, "marketsNotConfigured", "")}
        </p>
      )}
      {(marketContext?.warnings ?? []).map((w) => (
        <p key={w} style={{ ...theme.body, fontSize: "0.82rem", color: "#fbbf24", marginBottom: "8px" }}>
          {w}
        </p>
      ))}
      {applyFetcher.data?.intent === "confirm-markets" && applyFetcher.data?.marketError && (
        <p style={{ ...theme.body, color: "#f87171", marginBottom: "8px" }}>
          {applyFetcher.data.marketError}
        </p>
      )}
      {confirmed && !editing ? (
        <button
          type="button"
          style={{ ...theme.btnGhost, marginTop: "4px" }}
          onClick={() => {
            setEditing(true);
            setSelected(
              marketContext?.countryCodes?.length ? marketContext.countryCodes : defaultSelected(),
            );
          }}
        >
          {copyText(copy, "marketsChangeButton", "Change target markets")}
        </button>
      ) : (
        <button
          type="button"
          style={{ ...theme.btnPrimary, marginTop: "4px" }}
          disabled={confirming || !marketContext?.configured || selected.length === 0}
          onClick={submitConfirm}
        >
          {confirming ? copyText(copy, "loading", "…") : copyText(copy, "marketsConfirmButton", "Confirm")}
        </button>
      )}
    </div>
  );
}

function sortMarketCountries(countries, priorityCodes) {
  return [...countries].sort((a, b) => {
    const ai = priorityCodes.indexOf(a.code);
    const bi = priorityCodes.indexOf(b.code);
    if (ai >= 0 && bi >= 0) return ai - bi;
    if (ai >= 0) return -1;
    if (bi >= 0) return 1;
    return a.name.localeCompare(b.name);
  });
}

function formatRegionLabelFromCodes(codes, available) {
  const names = codes
    .map((code) => available.find((c) => c.code === code)?.name ?? code)
    .filter(Boolean);
  if (names.length === 0) return "your markets";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  if (names.length === 3) return `${names[0]}, ${names[1]}, and ${names[2]}`;
  return `${names.slice(0, 2).join(", ")} +${names.length - 2} more`;
}

function ValidationPanel({ copy, validation, marketContext }) {
  if (!validation) return null;
  return (
    <div style={{ ...theme.card, borderColor: "rgba(255,255,255,0.08)" }}>
      <p style={{ ...theme.body, margin: 0, fontSize: "0.88rem", color: "#c8c8d0" }}>
        {copyText(copy, "validationExplainProducts", "Markets confirmed. Product SEO scan reflected in your score.")}
      </p>
    </div>
  );
}

function IndexWizard({
  shop,
  shopName,
  copy,
  executive,
  snapshot,
  report,
  preview,
  appliedCatalog,
  setupComplete,
  hasBackup,
  backupBatchCount,
  backupSummary,
  billing,
  step,
  setStep,
  confirmed,
  setConfirmed,
  summaryInvalidated,
  totalSteps,
  aiFetcher,
  applyFetcher,
  aiRequested,
  aiSummaryAvailable,
  onRequestAiSummary,
  summary,
  summaryError,
  summaryTimedOut,
  summaryLoading,
  onRetryAiSummary,
  applyResult,
  applyError,
  applyLoading,
  restoreResult,
  restoreError,
  restoreLoading,
  resetTestResult,
  resetTestError,
  backupAvailable,
  restoreAvailable,
  uninstallRestorePreference,
  billingJustReturned,
  auditReloading,
  marketContext,
  validation,
  canPilotReset,
  productTier,
  benchmark,
  applyImpact,
  marketsWatch,
  searchConsole,
  deliveryStatus,
  auditFetcher,
  auditDataUrl,
}) {
  const pilotMode = Boolean(billing?.pilotMode);
  const { matrix, summary: snapSummary } = snapshot;
  const stepLabel = formatStepLabel(copyText(copy, "stepOf", "Step {{current}} of {{total}}"), step, totalSteps);
  const applyGain = executive.scoreAfterApply - executive.score;
  const allComplete = preview.total === 0;
  const schemaOnlyPreview = preview.productCount === 0 && preview.schema?.willApply;
  const catalogGaps = (executive.scoreFactors ?? []).filter((f) => f.group === "catalog" && !f.ok).length;
  const gapsRemain = preview.total > 0 || catalogGaps > 0;
  const pendingOptimization = applyGain > 0 && gapsRemain;
  const nearlyComplete = executive.score >= 85 && gapsRemain && applyGain > 0 && applyGain <= 10;
  const scoreRange =
    executive.scoreProjection ??
    formatProjectedScoreRange(executive.score, executive.scoreAfterApply, executive.scoreProjection);
  const marketsReady = Boolean(marketContext?.confirmed && marketContext?.configured);
  const isOptimized = setupComplete;
  const displayAppliedItems = applyResult?.appliedItems?.length
    ? applyResult.appliedItems
    : appliedCatalog;
  const scoreImprovement =
    applyResult?.scoreBefore != null && applyResult?.scoreAfter != null
      ? { before: applyResult.scoreBefore, after: applyResult.scoreAfter }
      : null;
  const catalogFactors = (executive.scoreFactors ?? []).filter((f) => f.group === "catalog");
  const foundationFactors = (executive.scoreFactors ?? []).filter((f) => f.group === "foundation");
  const scopeKey =
    snapSummary?.selectionLabelKey === "selectionFullCatalogExcluded"
      ? "scopeNoteFullCatalogExcluded"
      : snapSummary?.selectionLabelKey === "selectionFullCatalog"
        ? "scopeNoteFullCatalog"
        : "scopeNote";
  const scopeLabel = fillCopy(copyText(copy, scopeKey), {
    analyzed: snapSummary?.priorityCount ?? 0,
    total: snapSummary?.catalogTotal ?? 0,
    excluded: snapSummary?.excludedCount ?? 0,
  });
  const selectionSource = fillCopy(
    copyText(copy, snapSummary?.selectionLabelKey ?? "selectionFromRanking"),
    {
      collection: snapSummary?.selectionCollection ?? "",
      total: snapSummary?.catalogTotal ?? snapSummary?.priorityCount ?? 0,
      limit: snapSummary?.priorityLimit ?? 50,
      excluded: snapSummary?.excludedCount ?? 0,
    },
  );
  const selectionNote = fillCopy(copyText(copy, "selectionNote"), { selection: selectionSource });
  const priorityPlanLine = fillCopy(copyText(copy, "priorityPlanSummary"), {
    count: preview.productCount,
    batches: preview.batchCount,
    mirrors: preview.mirrorCount,
  });
  const previewStats = getPreviewChangeStats(preview);
  const setupPaid = billing?.setupPaid ?? false;
  const applyQuota = billing?.applyQuota;
  const firstApplyDone = Boolean(applyQuota?.setupDone);
  const hasPendingWork = preview.total > 0;
  const showAlreadyOptimized = !applyResult && !hasPendingWork && (firstApplyDone || setupComplete);
  const showStep1AlreadyDone = !applyResult && !hasPendingWork && (firstApplyDone || (backupAvailable && allComplete));
  const showOptimizedDashboardActions = step === 1 && !applyResult && (firstApplyDone || setupComplete);
  const canRestoreNow = firstApplyDone || setupComplete || restoreAvailable;
  const showPaymentGate = step === 2 && hasPendingWork && !applyResult && !setupPaid && !pilotMode;
  const showApplyGate =
    (step === 2 || step === 3) &&
    hasPendingWork &&
    !applyResult &&
    !firstApplyDone &&
    (pilotMode || setupPaid) &&
    marketsReady;
  const showApplyBlocked =
    (step === 2 || step === 3) &&
    hasPendingWork &&
    !applyResult &&
    !pilotMode &&
    setupPaid &&
    firstApplyDone;
  const showPaymentSuccess =
    billingJustReturned && step === 2 && hasPendingWork && !applyResult && setupPaid && !pilotMode;
  const showExpectationsPreview = step === 2 && !applyResult && hasPendingWork;
  const showPayStepActions =
    step === 2 &&
    (showPaymentGate || showApplyBlocked || showApplyGate);
  const showApplyStepActions = step === 3 && showApplyBlocked;
  const showBillingAlreadyApproved =
    step === 2 && setupPaid && !pilotMode && hasPendingWork && !firstApplyDone && !showPaymentGate;
  const activeDeliveryStatus = applyResult?.deliveryStatus ?? deliveryStatus;
  const catalogOverLimit =
    (snapSummary?.catalogTotal ?? 0) > (productTier?.effectiveLimit ?? 500);
  const displaySummaryError =
    summaryError || (summaryTimedOut ? copyText(copy, "aiTimeout", "Our AI did not respond in time.") : null);
  const productsUpdatedCount =
    applyResult?.productCount ?? applyResult?.applied ?? displayAppliedItems.length ?? 0;
  const schemaWasApplied = Boolean(applyResult?.schemaApplied || (setupComplete && executive.foundationScore >= 100));
  const schemaOnlyOutcome = applyResult
    ? Boolean(applyResult.schemaApplied && productsUpdatedCount === 0)
    : Boolean(setupComplete && preview.productCount === 0 && executive.foundationScore >= 100);

  useEffect(() => {
    if (step === 3 && hasPendingWork && !setupPaid && !pilotMode && !applyResult) {
      setStep(2);
    }
  }, [step, hasPendingWork, setupPaid, pilotMode, applyResult, setStep]);

  const prefSaving =
    applyFetcher.state !== "idle" &&
    applyFetcher.formData?.get("intent") === "set-uninstall-preference";
  const activeUninstallPref =
    applyFetcher.data?.intent === "set-uninstall-preference" &&
    applyFetcher.data?.uninstallRestorePreference
      ? applyFetcher.data.uninstallRestorePreference
      : uninstallRestorePreference ?? "restore";
  const prefSaved =
    applyFetcher.data?.intent === "set-uninstall-preference" &&
    applyFetcher.data?.uninstallRestorePreference &&
    !applyFetcher.data?.preferenceError;

  return (
    <div style={theme.page}>
      <style>{`
        @keyframes pc-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
      <header style={{ marginBottom: "20px" }}>
        <p style={{ margin: 0, fontSize: "0.75rem", color: "#6366f1", fontWeight: 600, letterSpacing: "0.06em" }}>
          {copy.subtitle}
        </p>
        <h1 style={{ margin: "4px 0 0 0", fontSize: "1.35rem", fontWeight: 700, color: "#fff" }}>
          {copy.title}
        </h1>
        <p style={{ margin: "6px 0 0 0", fontSize: "0.82rem", color: "#6b6b78" }}>{shopName}</p>
      </header>

      <p style={{ textAlign: "center", fontSize: "0.78rem", color: "#6b6b78", margin: "0 0 8px 0" }}>
        {stepLabel}
      </p>
      <Progress step={step} total={totalSteps} />

      {auditReloading && (
        <div style={{ ...theme.card, borderColor: "rgba(99,102,241,0.35)", background: "rgba(99,102,241,0.08)", marginBottom: "14px" }}>
          <p style={{ ...theme.body, color: "#a5b4fc", margin: 0, fontSize: "0.88rem" }}>
            {copyText(copy, "refreshingStore", "Updating your store…")}
          </p>
        </div>
      )}

      {step === 1 && (
        <>
          {scoreImprovement && scoreImprovement.after > scoreImprovement.before && (
            <div style={{ ...theme.card, borderColor: "rgba(163,230,53,0.35)", background: "rgba(163,230,53,0.08)" }}>
              <p style={{ ...theme.body, color: "#a3e635", margin: 0 }}>
                {copy.scoreImproved
                  .replace("{{before}}", String(scoreImprovement.before))
                  .replace("{{after}}", String(scoreImprovement.after))}
              </p>
            </div>
          )}

          {(summary || displaySummaryError) && (
            <div style={{ ...theme.card, borderColor: "rgba(99,102,241,0.45)", background: "rgba(99,102,241,0.1)" }}>
              <h2 style={{ ...theme.h2, color: "#a5b4fc" }}>{copyText(copy, "step3AiTitle", "AI summary")}</h2>
              {summary && (
                <p style={{ ...theme.body, whiteSpace: "pre-wrap", color: "#e8e8ef", margin: 0 }}>{summary}</p>
              )}
              {displaySummaryError && (
                <p style={{ ...theme.body, color: "#f87171", margin: summary ? "10px 0 0 0" : 0 }}>{displaySummaryError}</p>
              )}
            </div>
          )}

          <div style={{ ...theme.card, borderColor: "rgba(99,102,241,0.45)", background: "rgba(99,102,241,0.1)" }}>
            <h2 style={{ ...theme.h2, color: "#a5b4fc", marginBottom: "14px" }}>
              {copyText(copy, "step1ScoreHeadline", "Your AI visibility score")}
            </h2>
            <div style={{ display: "flex", alignItems: "flex-start", gap: "20px", flexWrap: "wrap" }}>
              <div style={theme.scoreRing(executive.score)}>
                <div style={theme.scoreInner}>{executive.score}</div>
              </div>
              <div style={{ flex: 1, minWidth: "200px" }}>
                <p style={{ margin: 0, fontSize: "1.05rem", fontWeight: 600, color: "#fff" }}>
                  {copy.scoreNow.replace("{{score}}", String(executive.score))}
                </p>
                {pendingOptimization && scoreRange && (
                  <p style={{ margin: "6px 0 0 0", fontSize: "0.88rem", color: "#a3e635" }}>
                    {copy.scoreAfterApply
                      .replace("{{low}}", String(scoreRange.low))
                      .replace("{{high}}", String(scoreRange.high))}
                  </p>
                )}
                <p style={{ margin: "10px 0 0 0", fontSize: "0.88rem", lineHeight: 1.55, color: "#c8c8d0" }}>
                  {copyText(copy, "step1WhyBrief", "")}
                </p>
                <p style={{ margin: "8px 0 0 0", fontSize: "0.82rem", color: "#8b8b9a" }}>
                  {copy.foundationScoreLabel}: {executive.foundationScore}/100 · {snapSummary.marketsLabel}
                </p>
              </div>
            </div>
            <p style={{ ...theme.body, marginTop: "14px", marginBottom: 0, fontSize: "0.82rem", color: "#a5b4fc" }}>
              {scopeLabel}
            </p>
            {catalogOverLimit && (
              <p style={{ ...theme.body, marginTop: "10px", marginBottom: 0, fontSize: "0.82rem", color: "#fbbf24", lineHeight: 1.55 }}>
                {fillCopy(copyText(copy, "catalogLargeNote"), {
                  total: String(snapSummary?.catalogTotal ?? 0),
                  limit: String(productTier?.effectiveLimit ?? 500),
                })}
              </p>
            )}
            <p style={{ ...theme.body, marginTop: "10px", marginBottom: 0, fontSize: "0.78rem", color: "#8b8b9a", lineHeight: 1.55 }}>
              {copyText(copy, "scoreIsPreparationNote", "")}
            </p>
          </div>

          <div style={theme.card}>
            <h2 style={theme.h2}>{copy.scoreBreakdownTitle}</h2>
            {catalogFactors.map((factor) => (
              <p key={factor.id} style={theme.bullet(factor.ok ? "#a3e635" : "#f87171")}>
                {factor.ok ? "✓ " : "○ "}
                {factor.label}
              </p>
            ))}
            {foundationFactors.map((factor) => (
              <p key={factor.id} style={theme.bullet(factor.ok ? "#a3e635" : "#f87171")}>
                {factor.ok ? "✓ " : "○ "}
                {factor.label}
              </p>
            ))}
          </div>

          <div style={theme.card}>
            <h2 style={theme.h2}>{copy.planTitle}</h2>
            {(report?.fixes ?? []).slice(0, 4).map((fix, i) => (
              <p key={i} style={theme.bullet("#a3e635")}>
                {fix}
              </p>
            ))}
            <p style={{ ...theme.body, marginTop: "12px", marginBottom: 0, fontSize: "0.82rem", color: "#8b8b9a" }}>
              {copyText(copy, "step1TimelineBrief", "")}
            </p>
          </div>

          <MarketsPanel copy={copy} marketContext={marketContext} applyFetcher={applyFetcher} />
          <ValidationPanel copy={copy} validation={validation} marketContext={marketContext} />
          <MarketsChangedBanner copy={copy} marketsWatch={marketsWatch} />

          <div style={{ ...theme.card, borderColor: "rgba(255,255,255,0.06)" }}>
            <p style={{ ...theme.body, margin: 0, fontSize: "0.88rem", color: "#c8c8d0" }}>
              {fillCopy(copyText(copy, "step1PlanIncludes", ""), {
                limit: String(productTier?.effectiveLimit ?? 500),
                analyzed: String(snapSummary?.priorityCount ?? preview?.productCount ?? 0),
                total: String(snapSummary?.catalogTotal ?? 0),
              })}
            </p>
          </div>

          {!firstApplyDone && !setupComplete && (
            <p style={{ ...theme.body, fontSize: "0.82rem", color: "#6b6b78", margin: "0 0 14px 0" }}>
              {copyText(copy, "step1AfterApplyNote", "")}
            </p>
          )}

          {(firstApplyDone || setupComplete) && (
            <>
              {!deliveryStatus?.crawlerReady && (
                <ThemeOnboardingPanel copy={copy} shop={shop} deliveryStatus={deliveryStatus} />
              )}
              <DeliveryChecklistPanel
                copy={copy}
                deliveryStatus={deliveryStatus}
                shop={shop}
                onRecheck={() => auditFetcher.load(auditDataUrl(true))}
                rechecking={auditFetcher.state === "loading"}
              />
              <ApplyImpactPanel copy={copy} applyImpact={applyImpact} />
              <SearchConsolePanel copy={copy} searchConsole={searchConsole} />
              <BenchmarkPanel copy={copy} benchmark={benchmark} />
              <ProductTierPanel copy={copy} productTier={productTier} shop={shop} showUpgrade />
            </>
          )}

          {(pilotMode || backupSummary?.baselineMissing) && (
            <>
              <BackupStatusPanel copy={copy} backupSummary={backupSummary} />
            <div style={{ ...theme.card, borderColor: "rgba(251,191,36,0.45)", background: "rgba(251,191,36,0.08)" }}>
              <h2 style={{ ...theme.h2, color: "#fbbf24" }}>
                {copyText(copy, "restoreVsResetTitle", "Undo vs reset")}
              </h2>
              <p style={{ ...theme.body, marginBottom: "8px", fontSize: "0.88rem" }}>
                {copyText(copy, "restoreVsResetBody", "")}
              </p>
              <p style={{ ...theme.body, marginBottom: "14px", fontSize: "0.82rem", color: "#8b8b9a" }}>
                {copyText(copy, "restoreVsResetWarning", "")}
              </p>
              <h3 style={{ ...theme.h2, fontSize: "0.95rem", color: "#fbbf24", marginTop: 0 }}>
                {copyText(copy, "resetTestTitle", "Undo all PredictaCore changes")}
              </h3>
              <p style={{ ...theme.body, marginBottom: "12px", fontSize: "0.88rem" }}>
                {copyText(copy, "resetTestBody", "")}
              </p>
              {resetTestResult && (
                <p style={{ ...theme.body, color: "#a3e635", marginBottom: "12px" }}>
                  {formatResetTestMessage(copy, resetTestResult)}
                </p>
              )}
              {resetTestError && (
                <p style={{ ...theme.body, color: "#f87171", marginBottom: "12px" }}>{resetTestError}</p>
              )}
              {restoreResult && (
                <p style={{ ...theme.body, color: "#a3e635", marginBottom: "8px" }}>
                  {formatRestoreMessage(copy, applyFetcher.data?.intent, restoreResult)}
                </p>
              )}
              {restoreResult?.productCount === 0 && restoreResult?.schemaRestored && (
                <p style={{ ...theme.body, fontSize: "0.82rem", color: "#8b8b9a", marginBottom: "12px" }}>
                  {copyText(copy, "restoreAllHint", "Restore only reverts backups.")}
                </p>
              )}
              <button
                type="button"
                style={{ ...theme.btnGhost, width: "100%", borderColor: "rgba(251,191,36,0.5)", color: "#fbbf24" }}
                disabled={restoreLoading}
                onClick={() => {
                  if (window.confirm(copyText(copy, "resetTestConfirm", "Reset test store?"))) {
                    applyFetcher.submit({ intent: "reset-test-store" }, { method: "post" });
                  }
                }}
              >
                {restoreLoading
                  ? copyText(copy, "resetTestLoading", "Resetting…")
                  : copyText(copy, "resetTestTitle", "Reset demo store")}
              </button>
            </div>
            </>
          )}

          {hasPendingWork && (
            <button type="button" style={theme.btnPrimary} onClick={() => setStep(2)}>
              {copy.continue}
            </button>
          )}

          {showStep1AlreadyDone && (
            <AlreadyOptimizedCard
              copy={copy}
              executive={executive}
              showRestore={canRestoreNow}
              restoreLoading={restoreLoading}
              applyFetcher={applyFetcher}
            />
          )}

          {(setupComplete || firstApplyDone) && backupAvailable && (
            <UninstallPreferencePanel
              copy={copy}
              preference={activeUninstallPref}
              applyFetcher={applyFetcher}
              saving={prefSaving}
              saved={prefSaved}
              preferenceError={
                applyFetcher.data?.intent === "set-uninstall-preference"
                  ? applyFetcher.data?.preferenceError
                  : null
              }
            />
          )}

          {showOptimizedDashboardActions && (
            <OptimizedDashboardActions
              copy={copy}
              applyFetcher={applyFetcher}
              restoreLoading={restoreLoading}
              backupBatchCount={backupBatchCount}
              canPilotReset={canPilotReset || pilotMode}
              restoreResult={restoreResult}
              restoreError={restoreError}
              applyFetcherIntent={applyFetcher.data?.intent}
            />
          )}
        </>
      )}

      {step === 2 && (
        <>
          <p style={{ ...theme.body, marginBottom: "14px", fontSize: "0.88rem", color: "#a5b4fc", lineHeight: 1.55 }}>
            {copyText(copy, "step2PayIntro", copy.step4FlowIntro)}
          </p>

          {showBillingAlreadyApproved && (
            <div style={{ ...theme.card, borderColor: "rgba(251,191,36,0.4)", background: "rgba(251,191,36,0.08)", marginBottom: "14px" }}>
              <p style={{ ...theme.body, color: "#fbbf24", margin: 0, lineHeight: 1.55 }}>
                {copyText(copy, "billingAlreadyApproved", "")}
              </p>
            </div>
          )}


          {!hasPendingWork && !applyResult && (
            <div style={{ ...theme.card, borderColor: "rgba(251,191,36,0.35)", background: "rgba(251,191,36,0.06)", marginBottom: "14px" }}>
              <p style={{ ...theme.body, color: "#e8e8ef", marginBottom: "14px", lineHeight: 1.55 }}>
                {copyText(copy, "step2NoPendingWork", "")}
              </p>
              {restoreAvailable && (
                <RestoreAllButton copy={copy} restoreLoading={restoreLoading} applyFetcher={applyFetcher} />
              )}
            </div>
          )}

          {showExpectationsPreview && (
            <ExpectationsPanel
              copy={copy}
              priorityCount={snapSummary.priorityCount}
              schemaOnlyOutcome={schemaOnlyPreview}
              variant="preview"
              showMaintenance={false}
              maintenanceLimit={productTier?.effectiveLimit ?? 500}
            />
          )}

          {!applyResult && hasPendingWork && (
            <PreviewChangesPanel
              copy={copy}
              preview={preview}
              previewStats={previewStats}
              schemaOnlyPreview={schemaOnlyPreview}
              shopName={shopName}
              shop={shop}
              region={marketContext?.regionLabel}
              setupPaid={setupPaid || pilotMode}
            />
          )}

          {showPaymentSuccess && <PaymentSuccessBanner copy={copy} />}

          {showBillingAlreadyApproved && (
            <div style={{ ...theme.card, borderColor: "rgba(163,230,53,0.35)", background: "rgba(163,230,53,0.06)", marginBottom: "14px" }}>
              <p style={{ ...theme.body, color: "#a3e635", margin: 0, lineHeight: 1.55 }}>
                {copyText(copy, "billingAlreadyApproved", "")}
              </p>
            </div>
          )}

          {!marketsReady && hasPendingWork && (
            <div style={{ ...theme.card, borderColor: "rgba(251,191,36,0.4)", background: "rgba(251,191,36,0.08)", marginBottom: "14px" }}>
              <p style={{ ...theme.body, color: "#fbbf24", margin: 0 }}>
                {copyText(copy, "marketsConfirmRequired", "")}
              </p>
            </div>
          )}

          {showPayStepActions && (
            <Step4Actions
              copy={copy}
              showPaymentGate={showPaymentGate}
              showApplyGate={showApplyGate}
              showApplyBlocked={showApplyBlocked}
              confirmed={confirmed}
              setConfirmed={setConfirmed}
              applyLoading={applyLoading}
              applyFetcher={applyFetcher}
              restoreLoading={restoreLoading}
            />
          )}

          <div style={{ display: "flex", gap: "10px", marginTop: "10px" }}>
            <button type="button" style={theme.btnGhost} onClick={() => setStep(1)}>{copy.back}</button>
          </div>
        </>
      )}

      {step === 3 && (
        <>
          {allComplete && restoreAvailable && !applyResult && (
            <div style={{ ...theme.card, borderColor: "rgba(251,191,36,0.4)", background: "rgba(251,191,36,0.08)" }}>
              <h2 style={{ ...theme.h2, color: "#fbbf24" }}>{copy.resetTitle}</h2>
              <p style={{ ...theme.body, marginBottom: "10px" }}>{copy.resetBody}</p>
              <p style={{ ...theme.body, fontSize: "0.82rem", color: "#8b8b9a", marginBottom: "14px" }}>
                {copy.resetHint}
              </p>
              <button
                type="button"
                style={{ ...theme.btnRestore }}
                disabled={restoreLoading}
                onClick={() => {
                  if (window.confirm(copy.restoreAllConfirm)) {
                    applyFetcher.submit({ intent: "restore-all" }, { method: "post" });
                  }
                }}
              >
                {restoreLoading ? copy.restoring : copy.restoreAll}
              </button>
            </div>
          )}

          {showApplyStepActions && (
            <Step4Actions
              copy={copy}
              showPaymentGate={false}
              showApplyGate={false}
              showApplyBlocked={showApplyBlocked}
              confirmed={confirmed}
              setConfirmed={setConfirmed}
              applyLoading={applyLoading}
              applyFetcher={applyFetcher}
              restoreLoading={restoreLoading}
            />
          )}

          {showAlreadyOptimized && (
            <AlreadyOptimizedCard
              copy={copy}
              executive={executive}
              onViewDashboard={() => setStep(1)}
              showRestore={restoreAvailable}
              restoreLoading={restoreLoading}
              applyFetcher={applyFetcher}
            />
          )}

          {applyResult && (
            <>
              <ApplyResultsCard
              copy={copy}
              applyResult={applyResult}
              executive={executive}
              preview={preview}
              displayAppliedItems={displayAppliedItems}
              productsUpdatedCount={productsUpdatedCount}
              schemaWasApplied={schemaWasApplied}
              schemaOnlyOutcome={schemaOnlyOutcome}
              priorityCount={snapSummary.priorityCount}
              marketRegion={marketContext?.regionLabel ?? applyResult?.marketRegion}
            />
            </>
          )}

          {applyResult && (
            <ExpectationsPanel
              copy={copy}
              priorityCount={snapSummary.priorityCount}
              productsUpdatedCount={productsUpdatedCount}
              schemaOnlyOutcome={schemaOnlyOutcome}
              schemaWasApplied={schemaWasApplied}
              showMaintenance={true}
              skipAppliedSection={true}
              maintenanceLimit={productTier?.effectiveLimit ?? 500}
            />
          )}

          {applyError && (
            <div style={theme.card}>
              <p style={{ ...theme.body, color: "#f87171" }}>{applyError}</p>
            </div>
          )}
          {restoreResult && (
            <div style={theme.card}>
              <p style={{ ...theme.body, color: "#a3e635" }}>
                {formatRestoreMessage(copy, applyFetcher.data?.intent, restoreResult)}
              </p>
              {applyFetcher.data?.intent === "restore-all" &&
                restoreResult.productCount === 0 &&
                restoreResult.schemaRestored && (
                  <p style={{ ...theme.body, fontSize: "0.82rem", color: "#8b8b9a", marginTop: "8px" }}>
                    {copyText(copy, "restoreAllHint", "Restore only reverts backups.")}
                  </p>
                )}
            </div>
          )}
          {resetTestResult && (
            <div style={theme.card}>
              <p style={{ ...theme.body, color: "#a3e635" }}>
                {formatResetTestMessage(copy, resetTestResult)}
              </p>
            </div>
          )}
          {resetTestError && (
            <div style={theme.card}>
              <p style={{ ...theme.body, color: "#f87171" }}>{resetTestError}</p>
            </div>
          )}
          {restoreError && (
            <div style={theme.card}>
              <p style={{ ...theme.body, color: "#f87171" }}>{restoreError}</p>
            </div>
          )}

          {restoreAvailable && (
            <>
              {applyResult && !pilotMode ? (
                <PostApplyMerchantPanel
                  copy={copy}
                  applyFetcher={applyFetcher}
                  restoreLoading={restoreLoading}
                  backupAvailable={restoreAvailable}
                  showUndoLast={backupBatchCount >= 1}
                  onViewDashboard={() => setStep(1)}
                  deliveryStatus={activeDeliveryStatus}
                  shop={shop}
                  onRecheckDelivery={() => auditFetcher.load(auditDataUrl(true))}
                  recheckingDelivery={auditFetcher.state === "loading"}
                />
              ) : (
                <>
                  <RestoreAllButton copy={copy} restoreLoading={restoreLoading} applyFetcher={applyFetcher} />
                  {backupBatchCount > 1 && (
                    <button
                      type="button"
                      style={{ ...theme.btnGhost, width: "100%", marginTop: "10px", color: "#c8c8d0" }}
                      disabled={restoreLoading}
                      onClick={() => {
                        if (window.confirm(copyText(copy, "restoreLastConfirm", copy.restoreWarning))) {
                          applyFetcher.submit({ intent: "restore" }, { method: "post" });
                        }
                      }}
                    >
                      {restoreLoading ? copy.restoring : copy.restore}
                    </button>
                  )}
                </>
              )}
            </>
          )}

          {(pilotMode || backupSummary?.baselineMissing) && (
            <button
              type="button"
              style={{ ...theme.btnGhost, width: "100%", marginTop: "10px", borderColor: "rgba(251,191,36,0.5)", color: "#fbbf24" }}
              disabled={restoreLoading}
              onClick={() => {
                if (window.confirm(copyText(copy, "resetTestConfirm", "Reset test store?"))) {
                  applyFetcher.submit({ intent: "reset-test-store" }, { method: "post" });
                }
              }}
            >
              {restoreLoading
                ? copyText(copy, "resetTestLoading", "Resetting…")
                : copyText(copy, "resetTestTitle", "Reset demo store")}
            </button>
          )}

          {backupAvailable && pilotMode && applyResult && (
            <UninstallPreferencePanel
              copy={copy}
              preference={activeUninstallPref}
              applyFetcher={applyFetcher}
              saving={prefSaving}
              saved={prefSaved}
              preferenceError={
                applyFetcher.data?.intent === "set-uninstall-preference"
                  ? applyFetcher.data?.preferenceError
                  : null
              }
            />
          )}

          {!applyResult && (
            <button type="button" style={{ ...theme.btnGhost, width: "100%" }} onClick={() => setStep(2)}>
              {copy.back}
            </button>
          )}
        </>
      )}
    </div>
  );
}
