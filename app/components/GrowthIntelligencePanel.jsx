const card = {
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: "14px",
  padding: "20px 22px",
  marginBottom: "16px",
};

const h2 = {
  fontSize: "0.78rem",
  fontWeight: 700,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: "#8b8b9a",
  margin: "0 0 12px",
};

const body = { color: "#e2e8f0", fontSize: "0.92rem", lineHeight: 1.55, margin: 0 };

function Metric({ label, value, hint, tone }) {
  const colors = {
    good: "#86efac",
    warn: "#fcd34d",
    bad: "#fca5a5",
    neutral: "#fff",
  };
  return (
    <div style={{ ...card, marginBottom: 0, padding: "14px 16px" }}>
      <div style={{ fontSize: "0.68rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "#8b8b9a" }}>
        {label}
      </div>
      <div style={{ fontSize: "1.45rem", fontWeight: 800, color: colors[tone] ?? colors.neutral, marginTop: 4 }}>
        {value}
      </div>
      {hint && <div style={{ fontSize: "0.72rem", color: "#8b8b9a", marginTop: 6 }}>{hint}</div>}
    </div>
  );
}

function ActionButton({ label, loading, onClick, variant = "primary" }) {
  const styles =
    variant === "danger"
      ? { background: "rgba(239,68,68,0.2)", border: "1px solid rgba(239,68,68,0.45)", color: "#fecaca" }
      : { background: "rgba(99,102,241,0.25)", border: "1px solid rgba(99,102,241,0.45)", color: "#c7d2fe" };
  return (
    <button
      type="button"
      disabled={loading}
      onClick={onClick}
      style={{
        ...styles,
        borderRadius: 10,
        padding: "11px 16px",
        fontWeight: 700,
        fontSize: "0.85rem",
        cursor: loading ? "wait" : "pointer",
        opacity: loading ? 0.6 : 1,
      }}
    >
      {loading ? "…" : label}
    </button>
  );
}

export function GrowthIntelligencePanel({ intelligence, locale, actionResult, actionError, loadingAction }) {
  const es = locale === "es";
  const v = intelligence.verdict ?? {};
  const meta = intelligence.meta ?? {};
  const shopify = intelligence.shopify ?? {};
  const gsc = intelligence.gsc ?? {};
  const seo = intelligence.seo ?? {};
  const period = meta.period?.totals ?? {};
  const funnel = meta.funnel?.meta ?? {};

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: "8px 0 40px" }}>
      <div style={{ marginBottom: 20 }}>
        <p style={{ ...body, fontSize: "0.72rem", letterSpacing: "0.2em", textTransform: "uppercase", color: "#a5b4fc" }}>
          {es ? "Centro de inteligencia" : "Intelligence hub"}
        </p>
        <h1 style={{ color: "#fff", fontSize: "1.75rem", fontWeight: 800, margin: "8px 0" }}>
          {es ? "Pam & Ander — decisiones con datos reales" : "Pam & Ander — data-driven decisions"}
        </h1>
        <p style={{ ...body, color: "#94a3b8", fontSize: "0.88rem" }}>
          {es
            ? "Shopify + Meta + Google + SEO/AI en un solo lugar. Variables en cada servicio — el pilot las junta."
            : "Shopify + Meta + Google + SEO/AI in one place. Each service holds its vars — pilot aggregates."}
        </p>
      </div>

      <div style={card}>
        <h2 style={{ ...h2, color: "#fcd34d" }}>{es ? "Veredicto" : "Verdict"}</h2>
        <p style={{ ...body, color: "#fef3c7", fontSize: "1rem" }}>{es ? v.headlineEs : v.headlineEn}</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 12, marginBottom: 16 }}>
        <Metric label="Meta spend" value={`$${(period.spend ?? funnel.spendUsd ?? 0).toFixed?.(2) ?? period.spend ?? "—"}`} />
        <Metric label={es ? "Clics Meta" : "Meta clicks"} value={String(funnel.linkClicks ?? period.clicks ?? 0)} />
        <Metric
          label={es ? "Compras pixel" : "Pixel purchases"}
          value={String(funnel.pixelPurchases ?? 0)}
          tone={(funnel.pixelPurchases ?? 0) > 0 ? "good" : "bad"}
        />
        <Metric
          label={es ? "Sesiones Shopify" : "Shopify sessions"}
          value={shopify.connected ? shopify.totalSessions?.toLocaleString() : "—"}
          hint={shopify.source}
        />
        <Metric
          label="Message match"
          value={meta.messageMatch?.score != null ? `${meta.messageMatch.score}/100` : "—"}
          tone={(meta.messageMatch?.score ?? 0) >= 55 ? "good" : "warn"}
        />
        <Metric
          label={es ? "Score SEO" : "SEO score"}
          value={seo.catalogScore != null ? `${seo.catalogScore}/100` : "—"}
          tone={(seo.catalogScore ?? 0) >= 80 ? "good" : "neutral"}
        />
      </div>

      <div style={card}>
        <h2 style={h2}>{es ? "PredictaCore ejecuta (Meta)" : "PredictaCore runs (Meta)"}</h2>
        <p style={{ ...body, color: "#94a3b8", marginBottom: 14, fontSize: "0.85rem" }}>
          {meta.connected
            ? es
              ? "Acciones vía predictacore-ads — token Meta ya está en ese servicio."
              : "Actions via predictacore-ads — Meta token lives there."
            : meta.error ?? (es ? "Meta no conectado — configura PREDICTACORE_ADS_INTERNAL_SECRET." : "Meta not connected.")}
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          <ActionButton
            label={es ? "Pausar campaña activa" : "Pause active campaign"}
            loading={loadingAction === "pause_active"}
            onClick={() => window.__growthAction?.("pause_active")}
            variant="danger"
          />
          <ActionButton
            label={es ? "Imagen Shopify en anuncio" : "Shopify image on ad"}
            loading={loadingAction === "patch_shopify_image"}
            onClick={() => window.__growthAction?.("patch_shopify_image")}
          />
          <ActionButton
            label={es ? "Relanzar Purchase" : "Relaunch Purchase"}
            loading={loadingAction === "relaunch_purchase"}
            onClick={() => window.__growthAction?.("relaunch_purchase")}
          />
        </div>
        {actionResult && <p style={{ ...body, color: "#86efac", marginTop: 12 }}>{actionResult}</p>}
        {actionError && <p style={{ ...body, color: "#fca5a5", marginTop: 12 }}>{actionError}</p>}
        {meta.runningLaunch?.conceptName && (
          <p style={{ ...body, fontSize: "0.78rem", color: "#64748b", marginTop: 10 }}>
            {es ? "Activa:" : "Active:"} {meta.runningLaunch.conceptName}
          </p>
        )}
      </div>

      {shopify.connected && (
        <div style={card}>
          <h2 style={{ ...h2, color: "#7dd3fc" }}>{es ? "Tráfico Shopify — referrers" : "Shopify traffic — referrers"}</h2>
          {(es ? shopify.botSuspicionNoteEs : shopify.botSuspicionNoteEn) && (
            <p style={{ ...body, color: "#fcd34d", marginBottom: 12 }}>{es ? shopify.botSuspicionNoteEs : shopify.botSuspicionNoteEn}</p>
          )}
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
            <thead>
              <tr style={{ color: "#64748b", textAlign: "left" }}>
                <th style={{ padding: "6px 8px" }}>{es ? "Fuente" : "Source"}</th>
                <th style={{ padding: "6px 8px" }}>{es ? "Sesiones" : "Sessions"}</th>
                <th style={{ padding: "6px 8px" }}>%</th>
              </tr>
            </thead>
            <tbody>
              {(shopify.referrers ?? []).map((r) => (
                <tr key={r.source} style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                  <td style={{ padding: "8px", color: "#fff" }}>{r.source || "(direct)"}</td>
                  <td style={{ padding: "8px", color: "#cbd5e1" }}>{r.sessions.toLocaleString()}</td>
                  <td style={{ padding: "8px", color: "#fcd34d" }}>{r.sharePct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {gsc.connected && (
        <div style={card}>
          <h2 style={h2}>Google Search Console</h2>
          <p style={body}>
            {gsc.totalClicks ?? 0} {es ? "clics" : "clicks"} · {gsc.totalImpressions ?? 0}{" "}
            {es ? "impresiones" : "impressions"} (28d)
          </p>
          {gsc.comparison?.clicksDelta != null && (
            <p style={{ ...body, color: "#86efac", fontSize: "0.85rem" }}>
              Δ clics vs baseline Apply: {gsc.comparison.clicksDelta >= 0 ? "+" : ""}
              {gsc.comparison.clicksDelta}
            </p>
          )}
        </div>
      )}

      {intelligence.aiBrief?.available && (
        <div style={{ ...card, borderColor: "rgba(167,139,250,0.35)" }}>
          <h2 style={{ ...h2, color: "#c4b5fd" }}>{es ? "Síntesis AI (Gemini)" : "AI synthesis (Gemini)"}</h2>
          <pre style={{ ...body, whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: "0.88rem" }}>
            {intelligence.aiBrief.text}
          </pre>
        </div>
      )}

      <div style={card}>
        <h2 style={h2}>{es ? "Fuentes de datos" : "Data sources"}</h2>
        <ul style={{ ...body, paddingLeft: 18, margin: 0, fontSize: "0.82rem", color: "#94a3b8" }}>
          {Object.entries(intelligence.sources ?? {}).map(([key, val]) => (
            <li key={key} style={{ marginBottom: 6 }}>
              <strong style={{ color: "#cbd5e1" }}>{key}:</strong> {String(val)}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
