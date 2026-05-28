import { json, redirect } from "@remix-run/node";
import { Form, useFetcher, useLoaderData, useRouteError, isRouteErrorResponse } from "@remix-run/react";
import { useEffect, useRef, useState } from "react";
import { LoadingShell } from "../components/AppShell.jsx";
import { AppErrorShell, routeErrorHint, routeErrorMessage } from "../components/AppErrorShell.jsx";
import { formatStepLabel } from "../lib/locale.js";
import { copyText, getPreviewChangeStats, fillCopy } from "../lib/preview.js";
import { formatProjectedScoreRange } from "../lib/score.js";

export async function loader({ request }) {
  const { authenticate } = await import("../shopify.server");
  const { session } = await authenticate.admin(request);
  const { t } = await import("../lib/locale.js");
  const locale = "en";
  const introKeys = [
    "title", "subtitle", "introTitle", "introBody", "introBullet1", "introBullet2", "introBullet3",
    "introNoChanges", "monthlyBeforePayTitle", "monthlyBeforePayBody",
    "maintenancePlan1", "maintenancePlan2", "maintenancePlan3",
    "pricingTitle", "pricingFree", "pricingSetup", "pricingMaintenance", "startAuditButton",
  ];
  const introCopy = Object.fromEntries(introKeys.map((key) => [key, t(locale, key)]));
  return json({ shop: session.shop, introCopy });
}

export async function action({ request }) {
  const { authenticate, SETUP_PLAN, MAINTENANCE_PLAN } = await import("../shopify.server");
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
  const { getStoreLocale, t } = await import("../lib/locale.js");
  const { isBillingBypassed, isBillingTest } = await import("../lib/billing.server.js");

  const { admin, session, billing } = await authenticate.admin(request);
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
      const result = await rollbackAllBatches(admin, session.shop);
      const { resetApplyQuotaAfterRestore } = await import("../lib/apply-quota.server.js");
      await resetApplyQuotaAfterRestore(session.shop);
      return json({ intent: "restore-all", restoreResult: result });
    } catch (err) {
      return json({ intent: "restore-all", restoreError: err.message ?? "Restore failed" });
    }
  }

  if (intent === "reset-test-store") {
    if (!isBillingBypassed()) {
      return json({ intent: "reset-test-store", resetTestError: "Not available in production billing mode" });
    }
    try {
      const result = await resetTestStoreForDemo(admin, session.shop);
      return json({ intent: "reset-test-store", resetTestResult: result });
    } catch (err) {
      return json({ intent: "reset-test-store", resetTestError: err.message ?? "Reset failed" });
    }
  }

  if (intent === "billing-setup") {
    const { runBillingSetupFlow } = await import("../lib/billing-flow.server.js");
    return runBillingSetupFlow({
      billing,
      session,
      isTest: isBillingTest(),
      SETUP_PLAN,
      MAINTENANCE_PLAN,
      syncBillingFromShopify: (await import("../lib/billing.server.js")).syncBillingFromShopify,
    });
  }

  if (intent === "billing-subscribe") {
    const { getBillingReturnUrls, MAINTENANCE_FIRST_CHARGE_DEFER_DAYS } = await import("../lib/billing-flow.server.js");
    const { syncBillingFromShopify } = await import("../lib/billing.server.js");
    const urls = getBillingReturnUrls(session.shop);
    const setupCheck = await billing.check({ plans: [SETUP_PLAN], isTest: isBillingTest() });
    const subCheck = await billing.check({ plans: [MAINTENANCE_PLAN], isTest: isBillingTest() });
    await syncBillingFromShopify(session.shop, setupCheck, subCheck);

    if (!setupCheck.hasActivePayment) {
      const { runBillingSetupFlow } = await import("../lib/billing-flow.server.js");
      return runBillingSetupFlow({
        billing,
        session,
        isTest: isBillingTest(),
        SETUP_PLAN,
        MAINTENANCE_PLAN,
        syncBillingFromShopify,
      });
    }

    if (!subCheck.hasActivePayment) {
      return billing.request({
        plan: MAINTENANCE_PLAN,
        isTest: isBillingTest(),
        trialDays: MAINTENANCE_FIRST_CHARGE_DEFER_DAYS,
        returnUrl: urls.adminReady,
      });
    }

    return redirect(urls.adminReady);
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

  if (intent === "billing-extra-apply") {
    const { getBillingReturnUrls } = await import("../lib/billing-flow.server.js");
    const { requestExtraApplyPurchase } = await import("../lib/billing-extra-apply.server.js");
    const { grantExtraApplyCredit } = await import("../lib/apply-quota.server.js");
    const urls = getBillingReturnUrls(session.shop);

    if (isBillingBypassed()) {
      await grantExtraApplyCredit(session.shop);
      return json({ intent: "billing-extra-apply", extraApplyGranted: true });
    }

    try {
      const { confirmationUrl } = await requestExtraApplyPurchase(
        admin,
        session.shop,
        `${urls.adminReady}&billing=extra-ready`,
      );
      return redirect(confirmationUrl);
    } catch (err) {
      return json({ intent: "billing-extra-apply", extraApplyError: err.message ?? "Payment failed" });
    }
  }

  if (intent === "confirm-extra-apply") {
    const { confirmExtraApplyPurchase } = await import("../lib/billing-extra-apply.server.js");
    const { grantExtraApplyCredit } = await import("../lib/apply-quota.server.js");
    const chargeId = form.get("charge_id");

    if (isBillingBypassed()) {
      await grantExtraApplyCredit(session.shop);
      return json({ intent: "confirm-extra-apply", extraApplyGranted: true });
    }

    try {
      const result = await confirmExtraApplyPurchase(admin, session.shop, chargeId);
      return json({ intent: "confirm-extra-apply", ...result, extraApplyGranted: result.granted });
    } catch (err) {
      return json({ intent: "confirm-extra-apply", extraApplyError: err.message ?? "Confirmation failed" });
    }
  }

  if (intent === "apply") {
    if (form.get("confirmed") !== "1") {
      return json({ intent: "apply", applyError: "Confirmation required" });
    }

    const pilotMode = isBillingBypassed();
    let setupPaid = pilotMode;
    let subscriptionActive = pilotMode;

    if (!pilotMode) {
      const setupCheck = await billing.check({
        plans: [SETUP_PLAN],
        isTest: isBillingTest(),
      });
      setupPaid = setupCheck.hasActivePayment;
      const subCheck = await billing.check({
        plans: [MAINTENANCE_PLAN],
        isTest: isBillingTest(),
      });
      subscriptionActive = subCheck.hasActivePayment;
      if (!setupPaid || !subscriptionActive) {
        const locale = "en";
        const { t: tr } = await import("../lib/locale.js");
        return json({ intent: "apply", applyError: tr(locale, "billingRequired"), billingBlocked: true });
      }
    }

    const { resolveManualApplyPermission } = await import("../lib/apply-quota.server.js");
    const permission = await resolveManualApplyPermission(session.shop, {
      pilotMode,
      setupPaid,
      subscriptionActive,
    });

    if (!permission.allowed) {
      const locale = "en";
      const { t: tr } = await import("../lib/locale.js");
      const messageKey =
        permission.reason === "monthly_auto_scheduled"
          ? "applyQuotaMonthlyAuto"
          : permission.reason === "quota_exhausted"
            ? "applyQuotaMonthlyDone"
            : "applyQuotaNoSubscription";
      return json({
        intent: "apply",
        applyError: tr(locale, messageKey).replace("{{period}}", permission.period ?? ""),
        applyQuotaBlocked: true,
        blockReason: permission.reason,
      });
    }

    try {
      const { runStoreApply } = await import("../lib/apply-runner.server.js");
      const outcome = await runStoreApply(admin, session.shop, { applyKind: permission.kind });

      if (outcome.skipped) {
        const locale = "en";
        const { t: tr } = await import("../lib/locale.js");
        const msg =
          outcome.reason === "all_failed"
            ? outcome.errors?.slice(0, 2).join("; ") || tr(locale, "applyError")
            : tr(locale, "noChangesAlreadyApplied");
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
    const categories = groupProductsByCategory(catalogData.products?.nodes ?? [], snapshot.matrix);
    const jsonLd = buildOrganizationJsonLd(
      data.shop,
      snapshot.markets,
      data.locations?.nodes ?? [],
    );
    const { active: schemaActive } = await getSchemaStatus(session.shop);
    const priorityProducts = getPriorityProducts(catalogData.products?.nodes ?? [], snapshot.matrix);
    const preview = buildPreviewPlan(
      priorityProducts,
      data.shop.name,
      snapshot.matrix,
      { jsonLd, schemaActive },
    );
    const executive = analyzeExecutive(catalogData, locale, {
      previewItems: preview.items,
      schemaActive,
      schemaPending: preview.schema?.willApply,
    });
    const report = buildForenseReport(data, executive, snapshot, categories, locale, preview);

    const summary = await generateForenseBrief(data.shop, snapshot.markets, report, locale);

    await saveEntityProfile(session.shop, {
      entityName: data.shop.name,
      specialization: report.fixes[0],
      areaServed: snapshot.summary.marketsLabel,
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

function formatRestoreMessage(copy, intent, result) {
  if (!result) return "";
  const products = String(result.productCount ?? 0);
  const batches = String(result.batches ?? 1);
  const schema = result.schemaRestored
    ? copyText(copy, "resultsAppliedBrand", "brand identity")
    : copyText(copy, "previewSchemaRow", "brand identity");

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
        <p style={theme.bullet("#a3e635")}>{copyText(copy, "resultsAppliedBrand", "Brand identity saved")}</p>
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

      {schemaWasApplied && (
        <p style={{ ...theme.body, fontSize: "0.82rem", color: "#8b8b9a", marginTop: "10px" }}>
          {copy.schemaEmbedNote}
        </p>
      )}
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

function AlreadyOptimizedCard({ copy, executive, onViewDashboard }) {
  return (
    <div style={{ ...theme.card, borderColor: "rgba(163,230,53,0.35)", background: "rgba(163,230,53,0.08)" }}>
      <h2 style={{ ...theme.h2, color: "#a3e635" }}>{copy.alreadyOptimizedTitle}</h2>
      <p style={{ ...theme.body, marginBottom: "8px", fontWeight: 600, color: "#fff" }}>
        {copy.scoreNow.replace("{{score}}", String(executive.score))}
      </p>
      <p style={{ ...theme.body, marginBottom: "14px", color: "#e8e8ef", lineHeight: 1.55 }}>
        {copy.alreadyOptimizedBody}
      </p>
      {onViewDashboard && (
        <button type="button" style={{ ...theme.btnGhost, width: "100%" }} onClick={onViewDashboard}>
          {copy.viewScoreDashboard}
        </button>
      )}
    </div>
  );
}

function BillingStatusCard({ copy, setupPaid, subscriptionActive, pilotMode }) {
  if (pilotMode) return null;

  const statusKey = setupPaid && subscriptionActive
    ? "billingStatusActive"
    : setupPaid
      ? "billingStatusSetupOnly"
      : "billingStatusNone";

  return (
    <div style={{ ...theme.card, borderColor: "rgba(99,102,241,0.25)", background: "rgba(99,102,241,0.06)" }}>
      <h2 style={{ ...theme.h2, color: "#a5b4fc" }}>{copyText(copy, "billingStatusTitle", "Billing status")}</h2>
      <p style={{ ...theme.body, fontSize: "0.88rem", color: "#e8e8ef", marginBottom: "10px", lineHeight: 1.55 }}>
        {copyText(copy, statusKey, "")}
      </p>
      <p style={{ ...theme.body, fontSize: "0.78rem", color: "#8b8b9a", margin: 0, lineHeight: 1.55 }}>
        {copyText(copy, "billingShopifyReceipt", "")}
      </p>
    </div>
  );
}

function PaymentGateCard({ copy, setupPaid = false }) {
  const needsSubscriptionOnly = setupPaid;
  return (
    <div style={{ ...theme.card, borderColor: "rgba(99,102,241,0.35)" }}>
      <h2 style={theme.h2}>{copy.step4FlowTitle}</h2>
      <p style={{ ...theme.body, marginBottom: "10px", color: "#e8e8ef" }}>{copy.previewNotAppliedYet}</p>
      <p style={{ ...theme.body, marginBottom: "14px", color: "#e8e8ef" }}>
        {needsSubscriptionOnly ? copyText(copy, "billingBundleStep2", copy.step4FlowIntro) : copy.step4FlowIntro}
      </p>
      <Form method="post" style={{ margin: 0 }}>
        <input type="hidden" name="intent" value="billing-setup" />
        <button type="submit" style={{ ...theme.btnPrimary, width: "100%" }}>
          {needsSubscriptionOnly
            ? copyText(copy, "billingBundleContinue", copy.unlockApply)
            : copy.unlockApply}
        </button>
      </Form>
      <p style={{ ...theme.body, fontSize: "0.78rem", color: "#9ca3af", marginTop: "12px", marginBottom: 0, lineHeight: 1.55 }}>
        {copy.billingFootnote}
      </p>
    </div>
  );
}

function IntroScreen({ copy, shopName, onStart }) {
  return (
    <div style={theme.page}>
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
        <p style={{ ...theme.body, marginBottom: "14px", color: "#e8e8ef", lineHeight: 1.6 }}>{copy.introBody}</p>
        <p style={theme.bullet("#a5b4fc")}>{copy.introBullet1}</p>
        <p style={theme.bullet("#a5b4fc")}>{copy.introBullet2}</p>
        <p style={theme.bullet("#a5b4fc")}>{copy.introBullet3}</p>
        <p style={{ ...theme.body, marginTop: "14px", fontSize: "0.82rem", color: "#8b8b9a", lineHeight: 1.55 }}>
          {copy.introNoChanges}
        </p>
      </div>

      <div style={{ ...theme.card, borderColor: "rgba(163,230,53,0.25)" }}>
        <h2 style={theme.h2}>{copy.monthlyBeforePayTitle}</h2>
        <p style={{ ...theme.body, marginBottom: "10px" }}>{copy.monthlyBeforePayBody}</p>
        <p style={theme.bullet("#6366f1")}>{copy.maintenancePlan1}</p>
        <p style={theme.bullet("#6366f1")}>{copy.maintenancePlan2}</p>
        <p style={theme.bullet("#6366f1")}>{copy.maintenancePlan3}</p>
      </div>

      <div style={{ ...theme.card, borderColor: "rgba(99,102,241,0.25)" }}>
        <h2 style={theme.h2}>{copy.pricingTitle}</h2>
        <p style={theme.bullet("#a3e635")}>{copy.pricingFree}</p>
        <p style={theme.bullet("#a5b4fc")}>{copy.pricingSetup}</p>
        <p style={theme.bullet("#8b8b9a")}>{copy.pricingMaintenance}</p>
      </div>

      <button type="button" style={theme.btnPrimary} onClick={onStart}>
        {copy.startAuditButton}
      </button>
    </div>
  );
}

function ExpectationsPanel({ copy, priorityCount, productsUpdatedCount = 0, schemaOnlyOutcome = false, schemaWasApplied = false, billing, showMaintenance = true }) {
  const count = String(priorityCount);
  const fill = (text) => text.replace("{{count}}", count);

  return (
    <div style={{ ...theme.card, borderColor: "rgba(163,230,53,0.35)", background: "rgba(163,230,53,0.06)" }}>
      <h2 style={{ ...theme.h2, color: "#a3e635" }}>{copy.expectationsTitle}</h2>

      <p style={{ ...theme.h2, marginTop: "16px" }}>{copy.expectationsMeansTitle}</p>
      <p style={theme.bullet("#a3e635")}>{copy.expectationsMeans1}</p>
      <p style={theme.bullet("#a3e635")}>
        {schemaOnlyOutcome
          ? copyText(copy, "expectationsMeans2ProductsDone", copy.expectationsMeans2)
          : fill(copy.expectationsMeans2)}
      </p>

      <p style={{ ...theme.h2, marginTop: "16px" }}>{copy.expectationsNotTitle}</p>
      <p style={theme.bullet("#fbbf24")}>{copy.expectationsNot1}</p>
      <p style={theme.bullet("#fbbf24")}>{copy.expectationsNot2}</p>

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

      <p style={{ ...theme.h2, marginTop: "16px" }}>{copy.expectationsTimelineTitle}</p>
      <p style={theme.bullet("#8b8b9a")}>{copy.expectationsTimeline1}</p>
      <p style={theme.bullet("#8b8b9a")}>{copy.expectationsTimeline2}</p>

      {showMaintenance && (
        <>
          <p style={{ ...theme.h2, marginTop: "16px" }}>{copy.maintenancePlanTitle}</p>
          <p style={{ ...theme.body, fontSize: "0.88rem", marginBottom: "8px" }}>{copy.maintenancePlanIntro}</p>
          <p style={theme.bullet("#6366f1")}>{copy.maintenancePlan1}</p>
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
  const { shop: shellShop, introCopy } = useLoaderData();
  const auditFetcher = useFetcher();
  const aiFetcher = useFetcher();
  const applyFetcher = useFetcher();
  const billingFetcher = useFetcher();
  const billingChainStarted = useRef(false);
  const extraApplyConfirmStarted = useRef(false);
  const summarySubmitStarted = useRef(false);
  const [step, setStep] = useState(1);
  const [summaryTimedOut, setSummaryTimedOut] = useState(false);
  const [auditStarted, setAuditStarted] = useState(false);
  const [aiRequested, setAiRequested] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [summaryInvalidated, setSummaryInvalidated] = useState(false);
  const totalSteps = 4;

  const startAudit = () => {
    setAuditStarted(true);
    auditFetcher.load("/app/audit-data");
  };

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
    billing,
    uninstallRestorePreference = "restore",
    aiSummaryAvailable = false,
  } = audit ?? {};

  const summary = aiFetcher.data?.intent === "summary" && !summaryInvalidated
    ? aiFetcher.data.summary
    : null;
  const summaryError = aiFetcher.data?.intent === "summary" && !summaryInvalidated
    ? aiFetcher.data.summaryError
    : null;
  const summaryLoading = aiFetcher.state !== "idle" && aiFetcher.formData?.get("intent") === "summary";

  const applyResult = applyFetcher.data?.intent === "apply" ? applyFetcher.data.applyResult : null;
  const applyError = applyFetcher.data?.intent === "apply" ? applyFetcher.data.applyError : null;
  const applyLoading = applyFetcher.state !== "idle" && applyFetcher.formData?.get("intent") === "apply";

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
  const setupComplete = Boolean(
    preview && executive && preview.total === 0 && executive.score >= 85 && backupAvailable,
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const billingParam = params.get("billing");

    if (billingParam === "chain" && !billingChainStarted.current && billingFetcher.state === "idle") {
      billingChainStarted.current = true;
      billingFetcher.submit({ intent: "billing-setup" }, { method: "post" });
      return;
    }

    if (billingParam === "ready" && auditStarted) {
      setStep(4);
      auditFetcher.load("/app/audit-data");
    }

    if (billingParam === "extra-ready" && auditStarted && !extraApplyConfirmStarted.current && billingFetcher.state === "idle") {
      extraApplyConfirmStarted.current = true;
      const chargeId = params.get("charge_id");
      billingFetcher.submit(
        { intent: "confirm-extra-apply", charge_id: chargeId ?? "" },
        { method: "post" },
      );
    }
  }, [auditStarted, billingFetcher.state]);

  useEffect(() => {
    if (billingFetcher.data?.extraApplyGranted) {
      auditFetcher.load("/app/audit-data");
    }
  }, [billingFetcher.data?.extraApplyGranted]);

  useEffect(() => {
    if (applyFetcher.data?.intent === "apply" && applyFetcher.data?.applyResult) {
      setSummaryInvalidated(true);
      setConfirmed(false);
      setStep(4);
      auditFetcher.load("/app/audit-data");
    }
  }, [applyFetcher.data]);

  useEffect(() => {
    if (restoreResult != null) {
      setSummaryInvalidated(true);
      setConfirmed(false);
      setAiRequested(false);
      summarySubmitStarted.current = false;
      setSummaryTimedOut(false);
      setStep(1);
      auditFetcher.load("/app/audit-data");
    }
  }, [restoreResult]);

  useEffect(() => {
    if (resetTestResult) {
      setSummaryInvalidated(true);
      setConfirmed(false);
      setStep(1);
      auditFetcher.load("/app/audit-data");
    }
  }, [resetTestResult]);

  useEffect(() => {
    if (setupComplete && step !== 1 && step !== 4) {
      setStep(4);
    }
  }, [setupComplete, step]);

  useEffect(() => {
    if (step !== 3 || !aiRequested || summary || summaryError || aiFetcher.state !== "idle") return;
    if (setupComplete) return;
    if (summarySubmitStarted.current) return;
    summarySubmitStarted.current = true;
    setSummaryTimedOut(false);
    aiFetcher.submit({ intent: "summary" }, { method: "post" });
  }, [step, aiRequested, summary, summaryError, aiFetcher.state, setupComplete]);

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
      />
    );
  }

  if (auditPending) {
    return (
      <LoadingShell
        message="Analyzing your store…"
      />
    );
  }

  if (error || !copy || !executive || !snapshot || !report || !preview) {
    return (
      <AppErrorShell
        message={error || copy?.error || "Unable to load store data"}
        hint={shop ? `Store: ${shop}` : undefined}
        onRetry={() => auditFetcher.load("/app/audit-data")}
      />
    );
  }

  return (
    <>
      {applyLoading && (
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
          <LoadingShell message={copy?.applying ?? "Applying…"} />
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
        uninstallRestorePreference={uninstallRestorePreference}
        extraApplyGranted={Boolean(billingFetcher.data?.extraApplyGranted)}
        extraApplyError={billingFetcher.data?.extraApplyError ?? null}
        auditReloading={auditReloading}
      />
    </>
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
      <p style={{ ...theme.body, fontSize: "0.88rem", marginBottom: "14px" }}>
        {copyText(copy, "uninstallPrefIntro", "")}
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
  uninstallRestorePreference,
  extraApplyGranted,
  extraApplyError,
  auditReloading,
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
  const scoreRange = formatProjectedScoreRange(executive.score, executive.scoreAfterApply);
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
  const subscriptionActive = billing?.subscriptionActive ?? false;
  const billingComplete = pilotMode || (setupPaid && subscriptionActive);
  const hasPendingWork = preview.total > 0;
  const showAlreadyOptimized = !applyResult && !hasPendingWork && setupComplete;
  const applyQuota = billing?.applyQuota;
  const firstApplyDone = Boolean(applyQuota?.setupDone);
  const showPaymentGate = hasPendingWork && !applyResult && !billingComplete && !pilotMode;
  const showSetupApplyGate =
    hasPendingWork &&
    !applyResult &&
    billingComplete &&
    !firstApplyDone &&
    Boolean(applyQuota?.canManualApply && applyQuota?.manualApplyKind === "setup");
  const showPostSetupBillingUi = firstApplyDone && billingComplete;
  const showExtraApplyGate =
    hasPendingWork &&
    !applyResult &&
    showPostSetupBillingUi &&
    Boolean(applyQuota?.canManualApply && applyQuota?.manualApplyKind === "extra");
  const showMonthlyAutoNotice =
    hasPendingWork &&
    !applyResult &&
    showPostSetupBillingUi &&
    applyQuota?.blockReason === "monthly_auto_scheduled";
  const showExtraPaymentGate =
    hasPendingWork &&
    !applyResult &&
    showPostSetupBillingUi &&
    Boolean(applyQuota?.needsExtraPayment);
  const showApplyQuotaCard = hasPendingWork && !applyResult && applyQuota && showPostSetupBillingUi;
  const showApplyGate = showSetupApplyGate || showExtraApplyGate;
  const analysisInProgress = aiRequested && summaryLoading && !summaryTimedOut;
  const displaySummaryError =
    summaryError || (summaryTimedOut ? copyText(copy, "aiTimeout", "Our AI did not respond in time.") : null);
  const canContinueFromStep3 =
    Boolean(summary) || Boolean(displaySummaryError) || !aiSummaryAvailable;
  const productsUpdatedCount =
    applyResult?.productCount ?? applyResult?.applied ?? displayAppliedItems.length ?? 0;
  const schemaWasApplied = Boolean(applyResult?.schemaApplied || (setupComplete && executive.foundationScore >= 100));
  const schemaOnlyOutcome = applyResult
    ? Boolean(applyResult.schemaApplied && productsUpdatedCount === 0)
    : Boolean(setupComplete && preview.productCount === 0 && executive.foundationScore >= 100);
  const whyUsItems = [copy.whyUs1, copy.whyUs2, copy.whyUs3, copy.whyUs4];

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

          <div style={{ ...theme.card, borderColor: "rgba(99,102,241,0.35)", background: "rgba(99,102,241,0.08)" }}>
            <h2 style={{ ...theme.h2, color: "#a5b4fc" }}>{copy.heroTitle}</h2>
            <p style={theme.body}>{copy.heroBody}</p>
            <p style={{ ...theme.body, marginTop: "10px", fontSize: "0.82rem", color: "#a5b4fc" }}>{scopeLabel}</p>
          </div>

          <div style={theme.card}>
            <h2 style={theme.h2}>{copy.impactTitle}</h2>
            <p style={theme.body}>{copy.impactIntro}</p>
          </div>

          <div style={{ ...theme.card, display: "flex", alignItems: "center", gap: "20px" }}>
            <div style={theme.scoreRing(executive.score)}>
              <div style={theme.scoreInner}>{executive.score}</div>
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ margin: 0, fontSize: "0.78rem", color: "#8b8b9a" }}>{copy.catalogScoreLabel}</p>
              <p style={{ margin: "4px 0 0 0", fontSize: "1.1rem", fontWeight: 600, color: "#fff" }}>
                {copy.scoreNow.replace("{{score}}", String(executive.score))}
              </p>
              {nearlyComplete && (
                <p style={{ margin: "4px 0 0 0", fontSize: "0.82rem", color: "#fbbf24" }}>
                  {copyText(
                    copy,
                    "scoreAlmostComplete",
                    "{{count}} products still need fixes — go to step 4 to finish (~{{score}}/100)",
                  )
                    .replace("{{count}}", String(preview.productCount || catalogGaps))
                    .replace("{{score}}", String(executive.scoreAfterApply))}
                </p>
              )}
              {pendingOptimization && !nearlyComplete && scoreRange && (
                <p style={{ margin: "4px 0 0 0", fontSize: "0.82rem", color: "#a3e635" }}>
                  {copy.scoreAfterApply
                    .replace("{{low}}", String(scoreRange.low))
                    .replace("{{high}}", String(scoreRange.high))}
                </p>
              )}
              {pendingOptimization && !nearlyComplete && !scoreRange && (
                <p style={{ margin: "4px 0 0 0", fontSize: "0.82rem", color: "#a3e635" }}>
                  {copy.scoreGainGeneric}
                </p>
              )}
              {allComplete && !pendingOptimization && (
                <p style={{ margin: "4px 0 0 0", fontSize: "0.82rem", color: "#a3e635" }}>
                  {copy.scoreSeoComplete}
                </p>
              )}
              <p style={{ margin: "8px 0 0 0", fontSize: "0.82rem", color: "#6b6b78" }}>
                {copy.foundationScoreLabel}: {executive.foundationScore}/100 · {snapSummary.marketsLabel}
              </p>
              <p style={{ margin: "10px 0 0 0", fontSize: "0.82rem", lineHeight: 1.5, color: "#8b8b9a" }}>
                {copy.scoreExplain}
              </p>
            </div>
          </div>

          <div style={{ ...theme.card, borderColor: "rgba(255,255,255,0.08)" }}>
            <h2 style={theme.h2}>{copyText(copy, "scorePlainTitle", "How to read your score")}</h2>
            <p style={{ ...theme.body, marginBottom: "10px" }}>
              {copyText(copy, "scorePlainBody", "Think of it as a readiness grade for AI search.")}
            </p>
            <p style={theme.bullet("#6366f1")}>{copyText(copy, "scorePlain1", "")}</p>
            <p style={theme.bullet("#6366f1")}>{copyText(copy, "scorePlain2", "")}</p>
            <p style={theme.bullet("#6366f1")}>{copyText(copy, "scorePlain3", "")}</p>
            <p style={theme.bullet("#6366f1")}>{copyText(copy, "scorePlain4", "")}</p>
            <p style={{ ...theme.body, marginTop: "12px", fontSize: "0.82rem", color: "#8b8b9a" }}>
              {copyText(copy, "scorePlainLow", "")}
            </p>
          </div>

          {(snapSummary?.excludedCount ?? 0) > 0 && (
            <div style={{ ...theme.card, borderColor: "rgba(165,180,252,0.25)", background: "rgba(99,102,241,0.06)" }}>
              <p style={{ ...theme.body, margin: 0, fontSize: "0.88rem", color: "#c8c8d0" }}>
                {fillCopy(copyText(copy, "catalogCountExplain", ""), {
                  analyzed: snapSummary?.priorityCount ?? 0,
                  total: snapSummary?.catalogTotal ?? 0,
                  excluded: snapSummary?.excludedCount ?? 0,
                })}
              </p>
            </div>
          )}

          <div style={theme.card}>
            <h2 style={theme.h2}>{copy.scoreBreakdownTitle}</h2>
            {catalogFactors.map((factor) => (
              <p key={factor.id} style={theme.bullet(factor.ok ? "#a3e635" : "#f87171")}>
                {factor.ok ? "✓ " : "○ "}
                {factor.label}
              </p>
            ))}
          </div>

          <div style={theme.card}>
            <h2 style={theme.h2}>{copy.foundationBreakdownTitle}</h2>
            {foundationFactors.map((factor) => (
              <p key={factor.id} style={theme.bullet(factor.ok ? "#a3e635" : "#f87171")}>
                {factor.ok ? "✓ " : "○ "}
                {factor.label}
              </p>
            ))}
          </div>

          {pilotMode && (
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
                  {formatRestoreMessage(copy, "restore-all", resetTestResult)}
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
          )}

          {!setupComplete && (
            <>
              <div style={theme.card}>
                <h2 style={theme.h2}>{copy.whyUsTitle}</h2>
                {whyUsItems.map((item) => (
                  <p key={item} style={theme.bullet("#6366f1")}>{item}</p>
                ))}
              </div>

              <div style={{ ...theme.card, borderColor: "rgba(99,102,241,0.25)" }}>
                <h2 style={theme.h2}>{copy.pricingTitle}</h2>
                <p style={theme.bullet("#a3e635")}>{copy.pricingFree}</p>
                <p style={theme.bullet("#a5b4fc")}>{copy.pricingSetup}</p>
                <p style={theme.bullet("#8b8b9a")}>{copy.pricingMaintenance}</p>
              </div>

              <button type="button" style={theme.btnPrimary} onClick={() => setStep(2)}>
                {copy.continue}
              </button>
            </>
          )}

          {setupComplete && (
            <div style={{ ...theme.card, borderColor: "rgba(163,230,53,0.35)", background: "rgba(163,230,53,0.08)" }}>
              <h2 style={{ ...theme.h2, color: "#a3e635" }}>{copy.setupCompleteTitle}</h2>
              <p style={{ ...theme.body, marginBottom: "14px" }}>{copy.setupCompleteBody}</p>
              <button type="button" style={theme.btnPrimary} onClick={() => setStep(4)}>
                {copy.viewSummary}
              </button>
            </div>
          )}

          {setupComplete && backupAvailable && (
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
        </>
      )}

      {step === 2 && (
        <>
          <p style={{ ...theme.body, marginBottom: "8px", fontSize: "0.82rem", color: "#a5b4fc", textAlign: "center" }}>
            {scopeLabel}
          </p>
          <p style={{ ...theme.body, marginBottom: "14px", fontSize: "0.78rem", color: "#8b8b9a", textAlign: "center" }}>
            {selectionNote}
          </p>
          <div style={{ ...theme.card, borderColor: "rgba(163,230,53,0.25)" }}>
            <h2 style={theme.h2}>{copy.monthlyBeforePayTitle}</h2>
            <p style={{ ...theme.body, marginBottom: "10px" }}>{copy.monthlyBeforePayBody}</p>
            <p style={theme.bullet("#6366f1")}>{copy.maintenancePlan1}</p>
            <p style={theme.bullet("#6366f1")}>{copy.maintenancePlan2}</p>
            <p style={theme.bullet("#6366f1")}>{copy.maintenancePlan3}</p>
          </div>
          <div style={theme.card}>
            <h2 style={theme.h2}>{copy.priorityTitle}</h2>
            <p style={{ ...theme.body, marginBottom: "10px", fontSize: "0.82rem", color: "#8b8b9a" }}>
              {copy.priorityExplain}
            </p>
            <p style={{ ...theme.body, marginBottom: "14px", fontSize: "0.82rem", color: "#a5b4fc" }}>
              {priorityPlanLine}
            </p>
            <p style={{ ...theme.body, marginBottom: "0", fontSize: "0.82rem", color: "#8b8b9a" }}>
              {fillCopy(copyText(copy, "priorityScopeSummary"), {
                count: snapSummary?.priorityCount ?? 0,
                high: snapSummary?.highPriority ?? 0,
                medium: snapSummary?.mediumPriority ?? 0,
              })}
            </p>
          </div>

          <div style={{ display: "flex", gap: "10px" }}>
            <button type="button" style={theme.btnGhost} onClick={() => setStep(1)}>{copy.back}</button>
            <button type="button" style={{ ...theme.btnPrimary, flex: 2 }} onClick={() => setStep(3)}>
              {copy.continue}
            </button>
          </div>
        </>
      )}

      {step === 3 && (
        <>
          <div style={theme.card}>
            <h2 style={theme.h2}>{copy.planTitle}</h2>
            {report.fixes.map((item) => (
              <p key={item} style={theme.bullet("#a3e635")}>{item}</p>
            ))}
          </div>

          {!summary && !analysisInProgress && (
            <div style={{ ...theme.card, borderColor: "rgba(99,102,241,0.35)" }}>
              <h2 style={theme.h2}>{copyText(copy, "step3AiTitle", "AI summary")}</h2>
              <p style={{ ...theme.body, marginBottom: "14px", color: "#8b8b9a", lineHeight: 1.55, fontSize: "0.88rem" }}>
                {copyText(copy, "step3AiIntro", "")}
              </p>
              {aiSummaryAvailable ? (
                <button type="button" style={{ ...theme.btnPrimary, width: "100%" }} onClick={onRequestAiSummary}>
                  {copyText(copy, "generateAiPlan", "Generate personalized AI plan")}
                </button>
              ) : (
                <p style={{ ...theme.body, fontSize: "0.82rem", color: "#f87171", margin: 0, lineHeight: 1.55 }}>
                  {copyText(copy, "aiNotConfigured", "")}
                </p>
              )}
            </div>
          )}

          {(analysisInProgress || summary) && (
            <div
              style={{
                ...theme.card,
                borderColor: analysisInProgress ? "rgba(99,102,241,0.55)" : "rgba(255,255,255,0.08)",
                background: analysisInProgress ? "rgba(99,102,241,0.12)" : undefined,
              }}
            >
              {analysisInProgress && (
                <>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "10px" }}>
                    <div
                      style={{
                        width: "18px",
                        height: "18px",
                        borderRadius: "50%",
                        border: "2px solid rgba(165,180,252,0.35)",
                        borderTopColor: "#a5b4fc",
                        animation: "pc-spin 0.8s linear infinite",
                        flexShrink: 0,
                      }}
                    />
                    <p style={{ ...theme.body, color: "#e8e8ff", fontWeight: 600, margin: 0 }}>
                      {copy.loading}
                    </p>
                  </div>
                  <p style={{ ...theme.body, fontSize: "0.82rem", color: "#c4c4ff", margin: 0 }}>
                    {copyText(copy, "loadingHint", "Please wait before continuing.")}
                  </p>
                </>
              )}
              {summary && !summaryLoading && (
                <p style={{ ...theme.body, whiteSpace: "pre-wrap", color: "#e8e8ef" }}>{summary}</p>
              )}
            </div>
          )}
          {displaySummaryError && (
            <div style={theme.card}>
              <p style={{ ...theme.body, color: "#f87171", marginBottom: "12px" }}>{displaySummaryError}</p>
              {aiSummaryAvailable && (
                <button type="button" style={theme.btnGhost} onClick={onRetryAiSummary}>
                  {copyText(copy, "retryAiPlan", "Try AI summary again")}
                </button>
              )}
            </div>
          )}

          <div style={{ ...theme.card, borderColor: "rgba(99,102,241,0.2)" }}>
            <p style={{ ...theme.body, fontSize: "0.82rem", color: "#8b8b9a" }}>{copy.rollbackNote}</p>
          </div>

          <p style={{ ...theme.body, fontSize: "0.82rem", color: "#8b8b9a", textAlign: "center", margin: "0 0 10px 0" }}>
            {canContinueFromStep3
              ? copyText(copy, "step3ContinueReady", copy.continue)
              : copyText(copy, "step3ContinueWait", "Generate the AI summary above to continue.")}
          </p>

          <div style={{ display: "flex", gap: "10px" }}>
            <button type="button" style={theme.btnGhost} onClick={() => setStep(2)}>
              {copy.back}
            </button>
            <button
              type="button"
              style={canContinueFromStep3 ? { ...theme.btnPrimary, flex: 2 } : { ...theme.btnDisabled, flex: 2 }}
              disabled={!canContinueFromStep3}
              onClick={() => setStep(4)}
            >
              {copy.continue}
            </button>
          </div>
        </>
      )}

      {step === 4 && (
        <>
          {allComplete && backupAvailable && !applyResult && (
            <div style={{ ...theme.card, borderColor: "rgba(251,191,36,0.4)", background: "rgba(251,191,36,0.08)" }}>
              <h2 style={{ ...theme.h2, color: "#fbbf24" }}>{copy.resetTitle}</h2>
              <p style={{ ...theme.body, marginBottom: "10px" }}>{copy.resetBody}</p>
              <p style={{ ...theme.body, fontSize: "0.82rem", color: "#8b8b9a", marginBottom: "14px" }}>
                {copy.resetHint}
              </p>
              <button
                type="button"
                style={{ ...theme.btnPrimary, width: "100%" }}
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

          {showPaymentGate && <PaymentGateCard copy={copy} setupPaid={setupPaid} />}

          {!pilotMode && (
            <BillingStatusCard
              copy={copy}
              setupPaid={setupPaid}
              subscriptionActive={subscriptionActive}
              pilotMode={pilotMode}
            />
          )}

          {!applyResult && hasPendingWork && (
          <div style={theme.card}>
            <h2 style={theme.h2}>{copy.previewTitle}</h2>
            <p style={{ ...theme.body, marginBottom: "12px", fontSize: "0.82rem", color: "#a5b4fc" }}>
              {copy.previewNotAppliedYet}
            </p>
            {schemaOnlyPreview ? (
              <>
                <p style={{ ...theme.body, marginBottom: "12px", color: "#fbbf24" }}>
                  {copyText(copy, "previewProductsDone", "Product SEO is already complete.")}
                </p>
                <p style={{ ...theme.body, marginBottom: "14px", color: "#e8e8ef" }}>
                  {copyText(copy, "previewSchemaOnlyExplain", "Brand identity will be saved.")
                    .replace("{{shop}}", shopName || shop || "your store")}
                </p>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.78rem" }}>
                  <thead>
                    <tr style={{ color: "#6b6b78", textAlign: "left" }}>
                      <th style={{ padding: "6px 4px" }}>{copy.product}</th>
                      <th style={{ padding: "6px 4px" }}>{copy.after}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                      <td style={{ padding: "10px 4px", color: "#fff", verticalAlign: "top" }}>
                        {copyText(copy, "previewSchemaRow", "Brand identity (Schema.org)")}
                      </td>
                      <td style={{ padding: "10px 4px", color: "#a3e635", verticalAlign: "top" }}>
                        {copyText(copy, "previewSchemaRowDetail", "Organization JSON-LD metafield")}
                      </td>
                    </tr>
                  </tbody>
                </table>
                <p style={{ ...theme.body, marginTop: "14px", color: "#a3e635", fontSize: "0.82rem" }}>
                  {copy.previewSchema}
                </p>
              </>
            ) : (
              <>
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
                </div>
                {preview.schema?.willApply && (
                  <p style={{ ...theme.body, marginBottom: "0", color: "#a3e635", fontSize: "0.82rem" }}>
                    {copy.previewSchema}
                  </p>
                )}
              </>
            )}
          </div>
          )}

          {showApplyQuotaCard && (
            <div style={{ ...theme.card, borderColor: "rgba(99,102,241,0.35)", background: "rgba(99,102,241,0.08)" }}>
              <h2 style={{ ...theme.h2, color: "#a5b4fc" }}>{copyText(copy, "applyQuotaTitle", "Apply rules")}</h2>
              <p style={{ ...theme.body, fontSize: "0.78rem", color: "#8b8b9a", marginBottom: "10px" }}>
                {fillCopy(copyText(copy, "applyQuotaPeriod", "Month: {{period}}"), { period: applyQuota.period })}
              </p>
              {!applyQuota.setupDone ? (
                <p style={{ ...theme.body, fontSize: "0.88rem" }}>{copyText(copy, "applyQuotaSetup", "")}</p>
              ) : applyQuota.extraApplyCredits > 0 ? (
                <p style={{ ...theme.body, fontSize: "0.88rem", color: "#a3e635" }}>
                  {fillCopy(copyText(copy, "applyQuotaExtraAvailable", ""), {
                    count: applyQuota.extraApplyCredits,
                  })}
                </p>
              ) : applyQuota.includedApplyUsed ? (
                <p style={{ ...theme.body, fontSize: "0.88rem" }}>
                  {fillCopy(copyText(copy, "applyQuotaMonthlyDone", ""), { period: applyQuota.period })}
                </p>
              ) : applyQuota.subscriptionActive ? (
                <p style={{ ...theme.body, fontSize: "0.88rem" }}>
                  {fillCopy(copyText(copy, "applyQuotaMonthlyAuto", ""), { period: applyQuota.period })}
                </p>
              ) : (
                <p style={{ ...theme.body, fontSize: "0.88rem" }}>
                  {copyText(copy, "applyQuotaNoSubscription", "")}
                </p>
              )}
            </div>
          )}

          {extraApplyGranted && (
            <div style={{ ...theme.card, borderColor: "rgba(163,230,53,0.35)", background: "rgba(163,230,53,0.08)" }}>
              <p style={{ ...theme.body, color: "#a3e635", margin: 0 }}>
                {copyText(copy, "extraApplySuccess", "Extra Apply credit added.")}
              </p>
            </div>
          )}

          {extraApplyError && (
            <div style={theme.card}>
              <p style={{ ...theme.body, color: "#f87171", margin: 0 }}>{extraApplyError}</p>
            </div>
          )}

          {showMonthlyAutoNotice && (
            <div style={{ ...theme.card, borderColor: "rgba(251,191,36,0.4)", background: "rgba(251,191,36,0.08)" }}>
              <p style={{ ...theme.body, marginBottom: "12px", color: "#fbbf24" }}>
                {fillCopy(copyText(copy, "applyQuotaMonthlyAuto", ""), { period: applyQuota?.period ?? "" })}
              </p>
              <Form method="post" style={{ margin: 0 }}>
                <input type="hidden" name="intent" value="billing-extra-apply" />
                <button
                  type="submit"
                  style={{ ...theme.btnGhost, width: "100%", borderColor: "rgba(251,191,36,0.5)", color: "#fbbf24" }}
                  onClick={(e) => {
                    if (!window.confirm(copyText(copy, "confirmExtraApply", "Pay $15 for extra Apply?"))) {
                      e.preventDefault();
                    }
                  }}
                >
                  {copyText(copy, "payExtraApply", "Pay $15 for extra Apply")}
                </button>
              </Form>
            </div>
          )}

          {showExtraPaymentGate && !showMonthlyAutoNotice && (
            <div style={{ ...theme.card, borderColor: "rgba(251,191,36,0.4)", background: "rgba(251,191,36,0.08)" }}>
              <h2 style={{ ...theme.h2, color: "#fbbf24" }}>{copyText(copy, "applyQuotaExtraPayment", "Extra Apply")}</h2>
              <p style={{ ...theme.body, marginBottom: "12px", fontSize: "0.88rem" }}>
                {copyText(copy, "applyQuotaExtraPaymentBody", "")}
              </p>
              <Form method="post" style={{ margin: 0 }}>
                <input type="hidden" name="intent" value="billing-extra-apply" />
                <button
                  type="submit"
                  style={{ ...theme.btnPrimary, width: "100%" }}
                  onClick={(e) => {
                    if (!window.confirm(copyText(copy, "confirmExtraApply", "Pay $15?"))) {
                      e.preventDefault();
                    }
                  }}
                >
                  {copyText(copy, "payExtraApply", "Pay $15 for extra Apply")}
                </button>
              </Form>
            </div>
          )}

          {showApplyGate && (
            <div style={{ ...theme.card, borderColor: "rgba(163,230,53,0.35)", background: "rgba(163,230,53,0.06)" }}>
              <p style={{ ...theme.body, marginBottom: "14px", color: "#a3e635", fontWeight: 600 }}>
                {showExtraApplyGate
                  ? fillCopy(copyText(copy, "applyQuotaExtraAvailable", ""), {
                      count: applyQuota?.extraApplyCredits ?? 1,
                    })
                  : copy.step4PaidIntro}
              </p>
              <label style={{ display: "flex", gap: "10px", alignItems: "flex-start", marginBottom: "12px", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                  style={{ marginTop: "4px" }}
                />
                <span style={{ ...theme.body, fontSize: "0.82rem", color: "#8b8b9a" }}>{copy.confirmLabel}</span>
              </label>
              <button
                type="button"
                style={confirmed && !applyLoading ? theme.btnPrimary : theme.btnDisabled}
                disabled={!confirmed || applyLoading}
                onClick={() =>
                  applyFetcher.submit({ intent: "apply", confirmed: "1" }, { method: "post" })
                }
              >
                {applyLoading ? copy.applying : copy.apply}
              </button>
            </div>
          )}

          {showAlreadyOptimized && (
            <AlreadyOptimizedCard copy={copy} executive={executive} onViewDashboard={() => setStep(1)} />
          )}

          {applyResult && (
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
            />
          )}

          {applyResult && (
            <ExpectationsPanel
              copy={copy}
              priorityCount={snapSummary.priorityCount}
              productsUpdatedCount={productsUpdatedCount}
              schemaOnlyOutcome={schemaOnlyOutcome}
              schemaWasApplied={schemaWasApplied}
              billing={billing}
            />
          )}

          {applyResult && billing?.subscriptionActive && (
            <div style={{ ...theme.card, borderColor: "rgba(99,102,241,0.2)" }}>
              <p style={{ ...theme.body, fontSize: "0.78rem", color: "#a5b4fc", margin: 0, lineHeight: 1.55 }}>
                {copy.pricingMaintenanceIncluded}
              </p>
            </div>
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
                {formatRestoreMessage(copy, "restore-all", resetTestResult)}
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

          {backupAvailable && (
            <>
              <button
                type="button"
                style={{ ...theme.btnPrimary, width: "100%", marginTop: "10px" }}
                disabled={restoreLoading}
                onClick={() => {
                  if (window.confirm(copy.restoreAllConfirm)) {
                    applyFetcher.submit({ intent: "restore-all" }, { method: "post" });
                  }
                }}
              >
                {restoreLoading ? copy.restoring : copy.restoreAll}
              </button>
              {backupBatchCount > 1 && (
                <button
                  type="button"
                  style={{ ...theme.btnGhost, width: "100%", marginTop: "10px" }}
                  disabled={restoreLoading}
                  onClick={() => {
                    if (window.confirm(copy.restoreWarning)) {
                      applyFetcher.submit({ intent: "restore" }, { method: "post" });
                    }
                  }}
                >
                  {restoreLoading ? copy.restoring : copy.restore}
                </button>
              )}
            </>
          )}

          {pilotMode && (
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

          {backupAvailable && (
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

          <div style={{ ...theme.card, borderColor: "rgba(99,102,241,0.2)" }}>
            <p style={{ ...theme.body, fontSize: "0.82rem", color: "#8b8b9a", margin: "0 0 8px 0" }}>
              {copy.restoreWarning}
            </p>
            <p style={{ ...theme.body, fontSize: "0.82rem", color: "#8b8b9a", margin: 0 }}>{copy.rollbackNote}</p>
          </div>

          {!setupComplete && (
            <button type="button" style={{ ...theme.btnGhost, width: "100%" }} onClick={() => setStep(3)}>
              {copy.back}
            </button>
          )}
        </>
      )}
    </div>
  );
}
