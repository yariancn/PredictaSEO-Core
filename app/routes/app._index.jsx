import { json } from "@remix-run/node";
import { useFetcher, useLoaderData, useRouteError, isRouteErrorResponse } from "@remix-run/react";
import { useEffect, useState } from "react";
import { LoadingShell } from "../components/AppShell.jsx";
import { AppErrorShell, routeErrorHint, routeErrorMessage } from "../components/AppErrorShell.jsx";
import { formatStepLabel } from "../lib/locale.js";
import { describePreviewChanges, copyText } from "../lib/preview.js";
import { formatProjectedScoreRange } from "../lib/score.js";

export async function loader({ request }) {
  const { authenticate } = await import("../shopify.server");
  const { session } = await authenticate.admin(request);
  return json({ shop: session.shop });
}

export async function action({ request }) {
  const { authenticate, SETUP_PLAN, MAINTENANCE_PLAN } = await import("../shopify.server");
  const { CATALOG_QUERY, analyzeExecutive, analyzeSnapshot, getPriorityProducts } = await import(
    "../lib/diagnostic.server.js"
  );
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

  if (intent === "billing-setup") {
    return billing.request({
      plan: SETUP_PLAN,
      isTest: isBillingTest(),
    });
  }

  if (intent === "billing-subscribe") {
    return billing.request({
      plan: MAINTENANCE_PLAN,
      isTest: isBillingTest(),
    });
  }

  if (intent === "restore") {
    try {
      const result = await rollbackLatestBatch(admin, session.shop);
      return json({ intent: "restore", restoreResult: result });
    } catch (err) {
      return json({ intent: "restore", restoreError: err.message ?? "Restore failed" });
    }
  }

  if (intent === "restore-all") {
    try {
      const result = await rollbackAllBatches(admin, session.shop);
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
      const response = await admin.graphql(CATALOG_QUERY);
      const { data, errors } = await response.json();
      if (errors?.length) {
        return json({ intent: "reset-test-store", resetTestError: errors.map((e) => e.message).join("; ") });
      }
      const snapshot = analyzeSnapshot(data);
      const priorityProducts = getPriorityProducts(data.products?.nodes ?? [], snapshot.matrix);
      const result = await resetTestStoreForDemo(admin, session.shop, priorityProducts);
      return json({ intent: "reset-test-store", resetTestResult: result });
    } catch (err) {
      return json({ intent: "reset-test-store", resetTestError: err.message ?? "Reset failed" });
    }
  }

  if (intent === "apply") {
    if (form.get("confirmed") !== "1") {
      return json({ intent: "apply", applyError: "Confirmation required" });
    }

    if (!isBillingBypassed()) {
      const setupCheck = await billing.check({
        plans: [SETUP_PLAN],
        isTest: isBillingTest(),
      });
      if (!setupCheck.hasActivePayment) {
        const locale = "en";
        const { t: tr } = await import("../lib/locale.js");
        return json({ intent: "apply", applyError: tr(locale, "billingRequired"), billingBlocked: true });
      }
    }

    try {
      const response = await admin.graphql(CATALOG_QUERY);
      const { data, errors } = await response.json();
      if (errors?.length) {
        return json({ intent: "apply", applyError: errors.map((e) => e.message).join("; ") });
      }
      const snapshot = analyzeSnapshot(data);
      const jsonLd = buildOrganizationJsonLd(
        data.shop,
        snapshot.markets,
        data.locations?.nodes ?? [],
      );
      const { active: schemaActive } = await getSchemaStatus(session.shop);
      const priorityProducts = getPriorityProducts(data.products?.nodes ?? [], snapshot.matrix);
      const preview = buildPreviewPlan(
        priorityProducts,
        data.shop.name,
        snapshot.matrix,
        { jsonLd, schemaActive },
      );
      if (preview.total === 0) {
        return json({ intent: "apply", applyError: "No changes to apply" });
      }
      const locale = getStoreLocale(data);
      const beforeExec = analyzeExecutive(data, locale, {
        previewItems: preview.items,
        schemaActive,
        schemaPending: preview.schema?.willApply,
      });
      const batchId = `batch_${Date.now()}`;
      const result = await applyPreviewPlan(admin, session.shop, preview, batchId, { jsonLd });

      const responseAfter = await admin.graphql(CATALOG_QUERY);
      const { data: dataAfter, errors: errorsAfter } = await responseAfter.json();
      let afterExec = beforeExec;
      if (!errorsAfter?.length && dataAfter) {
        afterExec = analyzeExecutive(dataAfter, locale, {
          previewItems: [],
          schemaActive: result.schemaApplied || schemaActive,
        });
      }

      return json({
        intent: "apply",
        applyResult: {
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
        },
        hasBackup: true,
      });
    } catch (err) {
      return json({ intent: "apply", applyError: err.message ?? "Apply failed" });
    }
  }

  if (intent !== "summary") {
    return json({ error: "Invalid action" });
  }

  let data = null;
  try {
    const response = await admin.graphql(CATALOG_QUERY);
    const parsed = await response.json();
    data = parsed.data;
    const { errors } = parsed;
    if (errors?.length) {
      return json({ summaryError: errors.map((e) => e.message).join("; ") });
    }
    if (!process.env.GEMINI_API_KEY) {
      const locale = getStoreLocale(data);
      const { t } = await import("../lib/locale.js");
      return json({ intent: "summary", summaryError: t(locale, "aiUnavailable") });
    }

    const locale = getStoreLocale(data);
    const snapshot = analyzeSnapshot(data);
    const categories = groupProductsByCategory(data.products?.nodes ?? [], snapshot.matrix);
    const jsonLd = buildOrganizationJsonLd(
      data.shop,
      snapshot.markets,
      data.locations?.nodes ?? [],
    );
    const { active: schemaActive } = await getSchemaStatus(session.shop);
    const priorityProducts = getPriorityProducts(data.products?.nodes ?? [], snapshot.matrix);
    const preview = buildPreviewPlan(
      priorityProducts,
      data.shop.name,
      snapshot.matrix,
      { jsonLd, schemaActive },
    );
    const executive = analyzeExecutive(data, locale, {
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

  if (intent === "restore-all" && result.productCount === 0 && result.schemaRestored) {
    return copyText(copy, "restoreAllSchemaOnly", "Brand identity restored. No product SEO was in the backup.");
  }
  if (intent === "restore-all") {
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
  setupComplete,
  preview,
  displayAppliedItems,
  productsUpdatedCount,
  schemaWasApplied,
  schemaOnlyOutcome,
  priorityCount,
  onViewDashboard,
}) {
  const scoreBefore = applyResult?.scoreBefore ?? executive?.score;
  const scoreAfter = applyResult?.scoreAfter ?? executive?.score;
  const gain = Math.max(0, (scoreAfter ?? 0) - (scoreBefore ?? 0));
  const catalogBefore = applyResult?.catalogScoreBefore ?? executive?.catalogScore ?? 0;
  const catalogAfter = applyResult?.catalogScoreAfter ?? executive?.catalogScore ?? 0;
  const foundationBefore = applyResult?.foundationScoreBefore ?? executive?.foundationScore ?? 0;
  const foundationAfter = applyResult?.foundationScoreAfter ?? executive?.foundationScore ?? 0;
  const priorityTotal = applyResult?.priorityCount ?? priorityCount ?? 0;

  let explainKey = "resultsScoreExplainProducts";
  if (schemaOnlyOutcome || (productsUpdatedCount === 0 && schemaWasApplied)) {
    explainKey = "resultsScoreExplainSchemaOnly";
  } else if (applyResult?.schemaApplied && productsUpdatedCount > 0) {
    explainKey = "resultsScoreExplainFull";
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
      {!applyResult && setupComplete && (
        <p style={{ ...theme.body, color: "#fff", marginBottom: "8px", fontWeight: 700, fontSize: "1.05rem" }}>
          {copy.scoreNow.replace("{{score}}", String(executive.score))}
        </p>
      )}

      {explain && applyResult && (
        <p style={{ ...theme.body, marginBottom: "14px", color: "#e8e8ef", lineHeight: 1.55 }}>{explain}</p>
      )}
      {!applyResult && setupComplete && (
        <p style={{ ...theme.body, marginBottom: "14px", color: "#e8e8ef", lineHeight: 1.55 }}>
          {copy.scoreSeoComplete}
        </p>
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
      {setupComplete && onViewDashboard && (
        <button
          type="button"
          style={{ ...theme.btnGhost, marginTop: "12px", width: "100%" }}
          onClick={onViewDashboard}
        >
          {copy.viewScoreDashboard}
        </button>
      )}
    </div>
  );
}

function ExpectationsPanel({ copy, priorityCount, productsUpdatedCount = 0, schemaOnlyOutcome = false, schemaWasApplied = false, billing, billingFetcher, showMaintenance = true }) {
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
          {!billing?.subscriptionActive && billingFetcher && (
            <button
              type="button"
              style={{ ...theme.btnGhost, width: "100%", marginTop: "12px" }}
              onClick={() => billingFetcher.submit({ intent: "billing-subscribe" }, { method: "post" })}
            >
              {copy.subscribeMaintenance}
            </button>
          )}
        </>
      )}
    </div>
  );
}

export default function Index() {
  const { shop: shellShop } = useLoaderData();
  const auditFetcher = useFetcher();
  const aiFetcher = useFetcher();
  const applyFetcher = useFetcher();
  const billingFetcher = useFetcher();
  const [step, setStep] = useState(1);
  const [confirmed, setConfirmed] = useState(false);
  const [summaryInvalidated, setSummaryInvalidated] = useState(false);
  const totalSteps = 4;

  useEffect(() => {
    auditFetcher.load("/app/audit-data");
  }, []);

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
    if (applyResult?.applied) {
      setSummaryInvalidated(true);
      setConfirmed(false);
      setStep(4);
      auditFetcher.load("/app/audit-data");
    }
  }, [applyResult?.applied]);

  useEffect(() => {
    if (restoreResult != null) {
      setSummaryInvalidated(true);
      setConfirmed(false);
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
    if (step !== 3 || summary || summaryError || aiFetcher.state !== "idle") return;
    if (setupComplete) return;
    const timer = setTimeout(() => {
      setSummaryInvalidated(false);
      aiFetcher.submit({ intent: "summary" }, { method: "post" });
    }, 300);
    return () => clearTimeout(timer);
  }, [step, summary, summaryError, aiFetcher.state, summaryInvalidated, setupComplete]);

  if (auditPending) {
    return <LoadingShell message="Analyzing your store…" />;
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
      {auditReloading && (
        <p
          style={{
            position: "fixed",
            top: 8,
            right: 12,
            margin: 0,
            fontSize: "0.72rem",
            color: "#a5b4fc",
            zIndex: 10,
          }}
        >
          Refreshing…
        </p>
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
        billingFetcher={billingFetcher}
        summary={summary}
        summaryError={summaryError}
        summaryLoading={summaryLoading}
        applyResult={applyResult}
        applyError={applyError}
        applyLoading={applyLoading}
        restoreResult={restoreResult}
        restoreError={restoreError}
        restoreLoading={restoreLoading}
        resetTestResult={resetTestResult}
        resetTestError={resetTestError}
        backupAvailable={backupAvailable}
      />
    </>
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
  billingFetcher,
  summary,
  summaryError,
  summaryLoading,
  applyResult,
  applyError,
  applyLoading,
  restoreResult,
  restoreError,
  restoreLoading,
  resetTestResult,
  resetTestError,
  backupAvailable,
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
  const scopeLabel = copyText(copy, "scopeNote", "Analyzed {{analyzed}} products · Catalog {{total}}")
    .replace("{{analyzed}}", String(snapSummary?.priorityCount ?? 0))
    .replace("{{total}}", String(snapSummary?.catalogTotal ?? 0));
  const canApply = billing?.canApply ?? false;
  const analysisInProgress = summaryLoading || (!summary && !summaryError);
  const canContinueFromAnalysis = Boolean(summary) || Boolean(summaryError);
  const productsUpdatedCount =
    applyResult?.productCount ?? applyResult?.applied ?? displayAppliedItems.length ?? 0;
  const schemaWasApplied = Boolean(applyResult?.schemaApplied || (setupComplete && executive.foundationScore >= 100));
  const schemaOnlyOutcome =
    Boolean(applyResult?.schemaApplied && productsUpdatedCount === 0) ||
    (setupComplete && preview.productCount === 0 && executive.foundationScore >= 100);
  const whyUsItems = [copy.whyUs1, copy.whyUs2, copy.whyUs3, copy.whyUs4];

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
              <h2 style={{ ...theme.h2, color: "#fbbf24" }}>{copyText(copy, "resetTestTitle", "Reset demo store")}</h2>
              <p style={{ ...theme.body, marginBottom: "12px", fontSize: "0.88rem" }}>
                {copyText(copy, "resetTestBody", "Clear product SEO and brand identity for a full demo rerun.")}
              </p>
              {resetTestResult && (
                <p style={{ ...theme.body, color: "#a3e635", marginBottom: "12px" }}>
                  {fillTemplate(copyText(copy, "resetTestSuccess", "Demo reset complete."), {
                    count: resetTestResult.productsCleared ?? 0,
                  })}
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
        </>
      )}

      {step === 2 && (
        <>
          <p style={{ ...theme.body, marginBottom: "14px", fontSize: "0.82rem", color: "#a5b4fc", textAlign: "center" }}>
            {scopeLabel}
          </p>
          <div style={theme.card}>
            <h2 style={theme.h2}>{copy.priorityTitle}</h2>
            <p style={{ ...theme.body, marginBottom: "14px", fontSize: "0.82rem", color: "#8b8b9a" }}>
              {copy.priorityExplain}
            </p>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.88rem" }}>
              <thead>
                <tr style={{ color: "#6b6b78", textAlign: "left" }}>
                  <th style={{ padding: "6px 4px", fontWeight: 500 }}>{copy.rank}</th>
                  <th style={{ padding: "6px 4px", fontWeight: 500 }}>{copy.product}</th>
                  <th style={{ padding: "6px 4px", fontWeight: 500 }}>{copy.score}</th>
                </tr>
              </thead>
              <tbody>
                {matrix?.slice(0, 5).map((row, i) => (
                  <tr key={row.product.id} style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                    <td style={{ padding: "10px 4px", color: "#6b6b78" }}>{i + 1}</td>
                    <td style={{ padding: "10px 4px", color: "#fff" }}>{row.product.title}</td>
                    <td style={{ padding: "10px 4px", color: "#a5b4fc", fontWeight: 600 }}>{row.score}</td>
                  </tr>
                ))}
              </tbody>
            </table>
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
          {summaryError && (
            <div style={theme.card}>
              <p style={{ ...theme.body, color: "#f87171" }}>{summaryError}</p>
            </div>
          )}

          <div style={{ ...theme.card, borderColor: "rgba(99,102,241,0.2)" }}>
            <p style={{ ...theme.body, fontSize: "0.82rem", color: "#8b8b9a" }}>{copy.rollbackNote}</p>
          </div>

          <div style={{ display: "flex", gap: "10px" }}>
            <button type="button" style={theme.btnGhost} onClick={() => setStep(2)} disabled={summaryLoading}>
              {copy.back}
            </button>
            <button
              type="button"
              style={canContinueFromAnalysis && !summaryLoading ? { ...theme.btnPrimary, flex: 2 } : { ...theme.btnDisabled, flex: 2 }}
              disabled={!canContinueFromAnalysis || summaryLoading}
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

          {!setupComplete && (
          <div style={theme.card}>
            <h2 style={theme.h2}>{copy.previewTitle}</h2>
            {preview.total === 0 ? (
              <p style={{ ...theme.body, color: "#a3e635" }}>{copy.previewAllDone}</p>
            ) : schemaOnlyPreview ? (
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
                <p style={{ ...theme.body, marginBottom: "14px", color: "#a5b4fc" }}>
                  {copy.previewSummary
                    .replace("{{count}}", String(preview.productCount))
                    .replace("{{batches}}", String(preview.batchCount))
                    .replace("{{mirrors}}", String(preview.mirrorCount))}
                </p>
                {preview.schema?.willApply && (
                  <p style={{ ...theme.body, marginBottom: "14px", color: "#a3e635" }}>
                    {copy.previewSchema}
                  </p>
                )}
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.78rem" }}>
                  <thead>
                    <tr style={{ color: "#6b6b78", textAlign: "left" }}>
                      <th style={{ padding: "6px 4px" }}>{copy.product}</th>
                      <th style={{ padding: "6px 4px" }}>{copy.after}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.items?.slice(0, 6).map((item) => (
                      <tr key={item.id} style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                        <td style={{ padding: "10px 4px", color: "#fff", verticalAlign: "top" }}>
                          {item.title}
                          {item.isMirror && <span style={{ color: "#a5b4fc" }}> ★</span>}
                        </td>
                        <td style={{ padding: "10px 4px", color: "#a3e635", verticalAlign: "top" }}>
                          {describePreviewChanges(item).map((line) => (
                            <div key={line} style={{ marginBottom: "4px" }}>
                              {line}
                            </div>
                          ))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {preview.total > 6 && (
                  <p style={{ ...theme.body, marginTop: "10px", fontSize: "0.78rem", color: "#6b6b78" }}>
                    {copy.moreProducts.replace("{{count}}", String(preview.total - 6))}
                  </p>
                )}
              </>
            )}
          </div>
          )}

          {(applyResult || setupComplete) && (
            <ApplyResultsCard
              copy={copy}
              applyResult={applyResult}
              executive={executive}
              setupComplete={setupComplete}
              preview={preview}
              displayAppliedItems={displayAppliedItems}
              productsUpdatedCount={productsUpdatedCount}
              schemaWasApplied={schemaWasApplied}
              schemaOnlyOutcome={schemaOnlyOutcome}
              priorityCount={snapSummary.priorityCount}
              onViewDashboard={() => setStep(1)}
            />
          )}

          {(applyResult || setupComplete) && (
            <ExpectationsPanel
              copy={copy}
              priorityCount={snapSummary.priorityCount}
              productsUpdatedCount={productsUpdatedCount}
              schemaOnlyOutcome={schemaOnlyOutcome}
              schemaWasApplied={schemaWasApplied}
              billing={billing}
              billingFetcher={billingFetcher}
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
                {fillTemplate(copyText(copy, "resetTestSuccess", "Demo reset complete."), {
                  count: resetTestResult.productsCleared ?? 0,
                })}
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

          {preview.total > 0 && !applyResult && !canApply && (
            <div style={{ ...theme.card, borderColor: "rgba(99,102,241,0.35)" }}>
              <h2 style={theme.h2}>{copy.pricingTitle}</h2>
              <p style={{ ...theme.body, marginBottom: "12px" }}>{copy.billingRequired}</p>
              <p style={{ ...theme.body, fontSize: "0.82rem", color: "#8b8b9a", marginBottom: "14px" }}>
                {copy.pricingSetup}
              </p>
              <button
                type="button"
                style={theme.btnPrimary}
                onClick={() => billingFetcher.submit({ intent: "billing-setup" }, { method: "post" })}
              >
                {copy.unlockApply}
              </button>
            </div>
          )}

          {preview.total > 0 && !applyResult && canApply && (
            <>
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
            </>
          )}

          {applyResult && !billing?.subscriptionActive && (
            <div style={theme.card}>
              <p style={{ ...theme.body, marginBottom: "12px", fontSize: "0.82rem", color: "#8b8b9a" }}>
                {copy.pricingMaintenance}
              </p>
              <button
                type="button"
                style={theme.btnGhost}
                onClick={() => billingFetcher.submit({ intent: "billing-subscribe" }, { method: "post" })}
              >
                {copy.subscribeMaintenance}
              </button>
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
