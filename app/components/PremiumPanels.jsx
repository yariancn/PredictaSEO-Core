import { copyText } from "../lib/preview.js";
import { automatedDeliveryPct, splitDeliveryChecks } from "../lib/delivery-checks.js";

const card = {
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: "14px",
  padding: "20px 22px",
  marginBottom: "14px",
};

const h2 = {
  margin: "0 0 12px 0",
  fontSize: "0.72rem",
  fontWeight: 600,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "#8b8b9a",
};

const body = {
  margin: 0,
  fontSize: "0.95rem",
  lineHeight: 1.55,
  color: "#c8c8d0",
};

export function ProductTierPanel({ copy, productTier, shop, showUpgrade = true }) {
  if (!productTier) return null;
  return (
    <div style={{ ...card, borderColor: "rgba(99,102,241,0.35)", background: "rgba(99,102,241,0.08)" }}>
      <h2 style={{ ...h2, color: "#a5b4fc" }}>{copyText(copy, "productTierTitle", "Product scope")}</h2>
      <p style={{ ...body, marginBottom: "10px" }}>
        {copyText(copy, "productTierBody", "")
          .replace("{{limit}}", String(productTier.effectiveLimit))
          .replace("{{base}}", String(productTier.baseLimit))
          .replace("{{ai}}", String(productTier.aiPolishLimit))}
      </p>
      {showUpgrade && productTier.canExpand && (
        <a
          href={`/app/billing/extra-products?shop=${encodeURIComponent(shop)}`}
          style={{
            display: "inline-block",
            marginTop: "8px",
            padding: "12px 16px",
            background: "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)",
            color: "#fff",
            borderRadius: "10px",
            textDecoration: "none",
            fontWeight: 600,
            fontSize: "0.9rem",
          }}
        >
          {copyText(copy, "productTierUpgrade", "")
            .replace("{{size}}", String(productTier.nextPackSize))
            .replace("{{price}}", String(productTier.nextPackPrice))}
        </a>
      )}
    </div>
  );
}

export function ThemeOnboardingPanel({ copy, shop, deliveryStatus }) {
  const storeHandle = (shop ?? "").replace(".myshopify.com", "");
  const adminThemes = `https://admin.shopify.com/store/${storeHandle}/themes/current/editor?context=apps`;
  const storeUrl =
    deliveryStatus?.storeUrl ??
    (shop ? `https://${shop.replace(".myshopify.com", "")}.com` : "");
  const llmsUrl = storeUrl ? `${storeUrl.replace(/\/$/, "")}/apps/predictacore/llms.txt` : "/apps/predictacore/llms.txt";
  const stepKeys = [
    "themeOnboardingStep1",
    "themeOnboardingStep2",
    "themeOnboardingStep3",
    "themeOnboardingStep4",
    "themeOnboardingStep5",
    "themeOnboardingStep6",
    "themeOnboardingStep7",
  ];

  return (
    <div style={{ ...card, borderColor: "rgba(163,230,53,0.35)", background: "rgba(163,230,53,0.06)" }}>
      <h2 style={{ ...h2, color: "#a3e635" }}>{copyText(copy, "themeOnboardingTitle", "Activate storefront blocks")}</h2>
      <p style={{ ...body, marginBottom: "12px" }}>{copyText(copy, "themeOnboardingBody", "")}</p>
      <p style={{ ...body, fontSize: "0.82rem", fontWeight: 600, color: "#a3e635", marginBottom: "8px" }}>
        {copyText(copy, "themeOnboardingStepsTitle", "Step-by-step")}
      </p>
      <ol style={{ ...body, fontSize: "0.88rem", paddingLeft: "1.35rem", marginBottom: "12px" }}>
        {stepKeys.map((key) => (
          <li key={key} style={{ marginBottom: "8px" }}>
            {copyText(copy, key, key).replace("{{llmsUrl}}", llmsUrl)}
          </li>
        ))}
      </ol>
      <ul style={{ ...body, fontSize: "0.85rem", paddingLeft: "1.2rem", marginBottom: "12px", color: "#8b8b9a" }}>
        <li>{copyText(copy, "themeOnboardingBrand", "PredictaCore Brand")}</li>
        <li>{copyText(copy, "themeOnboardingProduct", "PredictaCore Product")}</li>
      </ul>
      <p style={{ ...body, fontSize: "0.82rem", color: "#8b8b9a", marginBottom: "12px" }}>
        {copyText(copy, "themeOnboardingLlms", "")}
      </p>
      <p style={{ ...body, fontSize: "0.82rem", color: "#a3e635", marginBottom: "12px" }}>
        {copyText(copy, "themeOnboardingAfterSteps", "")}
      </p>
      <a
        href={adminThemes}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: "inline-block",
          padding: "12px 16px",
          border: "1px solid rgba(163,230,53,0.5)",
          color: "#a3e635",
          borderRadius: "10px",
          textDecoration: "none",
          fontWeight: 600,
          fontSize: "0.9rem",
          marginRight: "8px",
        }}
      >
        {copyText(copy, "themeOnboardingCta", "Open theme editor")}
      </a>
      {llmsUrl.startsWith("http") && (
        <a
          href={llmsUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "inline-block",
            padding: "12px 16px",
            border: "1px solid rgba(99,102,241,0.45)",
            color: "#a5b4fc",
            borderRadius: "10px",
            textDecoration: "none",
            fontWeight: 600,
            fontSize: "0.9rem",
          }}
        >
          llms.txt
        </a>
      )}
    </div>
  );
}

export function BenchmarkPanel({ copy, benchmark }) {
  if (!benchmark) return null;
  return (
    <div style={card}>
      <h2 style={h2}>{copyText(copy, "benchmarkTitle", "Category benchmark")}</h2>
      <p style={body}>
        {copyText(copy, benchmark.messageKey, "")
          .replace("{{your}}", String(benchmark.yourScore))
          .replace("{{typical}}", String(benchmark.typicalScore))
          .replace("{{delta}}", String(Math.abs(benchmark.delta)))}
      </p>
    </div>
  );
}

export function ApplyImpactPanel({ copy, applyImpact }) {
  if (!applyImpact) return null;
  return (
    <div style={{ ...card, borderColor: "rgba(163,230,53,0.35)", background: "rgba(163,230,53,0.06)" }}>
      <h2 style={{ ...h2, color: "#a3e635" }}>{copyText(copy, "applyImpactTitle", "Last optimization impact")}</h2>
      <p style={{ ...body, marginBottom: "8px" }}>
        {copyText(copy, "impactScore", "")
          .replace("{{before}}", String(applyImpact.scoreBefore))
          .replace("{{after}}", String(applyImpact.scoreAfter))}
      </p>
      <p style={{ ...body, fontSize: "0.88rem", color: "#8b8b9a", marginBottom: "8px" }}>
        {copyText(copy, "impactProducts", "")
          .replace("{{count}}", String(applyImpact.productsUpdated))
          .replace("{{scope}}", String(applyImpact.productsInScope))}
      </p>
      {applyImpact.gscBefore && applyImpact.gscAfter && (
        <p style={{ ...body, fontSize: "0.88rem", color: "#a5b4fc", marginBottom: "8px" }}>
          {copyText(copy, "gscBaseline", "")
            .replace("{{impressions}}", String(applyImpact.gscBefore.impressions))
            .replace("{{clicks}}", String(applyImpact.gscBefore.clicks))}
          {" → "}
          {copyText(copy, "gscLatest", "")
            .replace("{{impressions}}", String(applyImpact.gscAfter.impressions))
            .replace("{{clicks}}", String(applyImpact.gscAfter.clicks))}
        </p>
      )}
      {applyImpact.deliveryTotal != null && (
        <p style={{ ...body, fontSize: "0.88rem", color: applyImpact.deliveryReady ? "#a3e635" : "#fbbf24" }}>
          {(applyImpact.deliveryReady
            ? copyText(copy, "deliveryImpactReady", "")
            : copyText(copy, "deliveryImpactNotReady", "")
          )
            .replace("{{done}}", String(applyImpact.deliveryPassed ?? 0))
            .replace("{{total}}", String(applyImpact.deliveryTotal))}
        </p>
      )}
    </div>
  );
}

export function DeliveryChecklistPanel({ copy, deliveryStatus, shop, onRecheck, rechecking = false }) {
  if (!deliveryStatus?.checks?.length) return null;

  const storeHandle = (shop ?? "").replace(".myshopify.com", "");
  const themeUrl =
    deliveryStatus.themeEditorUrl ??
    `https://admin.shopify.com/store/${storeHandle}/themes/current/editor?context=apps`;
  const { automated, recommended } = splitDeliveryChecks(deliveryStatus.checks);
  const autoPassed = automated.filter((c) => c.ok).length;
  const autoTotal = automated.length;
  const recPending = recommended.filter((c) => !c.ok).length;
  const autoPct = automatedDeliveryPct(deliveryStatus.checks);
  const allAutomatedDone = autoTotal > 0 && autoPassed === autoTotal;
  const crawlerReady = Boolean(deliveryStatus.crawlerReady);
  const border = crawlerReady ? "rgba(163,230,53,0.45)" : allAutomatedDone ? "rgba(163,230,53,0.45)" : "rgba(99,102,241,0.35)";
  const bg = crawlerReady ? "rgba(163,230,53,0.08)" : allAutomatedDone ? "rgba(163,230,53,0.08)" : "rgba(99,102,241,0.08)";
  const liveProductCheck = deliveryStatus.checks.find((c) => c.id === "live_product_jsonld");
  const liveProductUrl = liveProductCheck?.url ?? null;
  const richResultsUrl = liveProductUrl
    ? `https://search.google.com/test/rich-results?url=${encodeURIComponent(liveProductUrl)}`
    : null;
  const showVerify = allAutomatedDone && (richResultsUrl || liveProductUrl);

  return (
    <div style={{ ...card, borderColor: border, background: bg }}>
      <h2 style={{ ...h2, color: crawlerReady || allAutomatedDone ? "#a3e635" : "#a5b4fc" }}>
        {copyText(copy, "deliveryTitle", "What PredictaCore completed")}
      </h2>
      <p style={{ ...body, fontSize: "0.88rem", marginBottom: "12px" }}>
        {copyText(copy, "deliveryIntro", "")}
      </p>
      <p style={{ ...body, fontWeight: 600, color: crawlerReady || allAutomatedDone ? "#a3e635" : "#a5b4fc", marginBottom: "12px" }}>
        {crawlerReady
          ? copyText(copy, "deliveryReadyLive", "")
          : allAutomatedDone
            ? copyText(copy, "deliveryReady", "")
            : copyText(copy, "deliveryNotReady", "")
                .replace("{{done}}", String(autoPassed))
                .replace("{{pending}}", String(recPending))}
        {autoTotal > 0 && (
          <>
            {" · "}
            {copyText(copy, "deliveryScore", "").replace("{{pct}}", String(autoPct))}
          </>
        )}
      </p>
      {automated.length > 0 && (
        <ul style={{ ...body, fontSize: "0.85rem", paddingLeft: "1.2rem", marginBottom: "14px" }}>
          {automated.map((check) => (
            <li key={check.id} style={{ color: check.ok ? "#a3e635" : "#fbbf24", marginBottom: "6px" }}>
              {check.ok ? "✓" : "○"} {copyText(copy, check.labelKey, check.id)}
            </li>
          ))}
        </ul>
      )}
      {recommended.length > 0 && (
        <>
          <h3 style={{ ...h2, color: "#fbbf24", marginTop: "4px" }}>
            {copyText(copy, "deliveryRecommendTitle", "Recommended — further improve AI visibility")}
          </h3>
          <p style={{ ...body, fontSize: "0.85rem", marginBottom: "8px", lineHeight: 1.55 }}>
            {copyText(copy, "deliveryRecommendIntro", "")}
          </p>
          <p style={{ ...body, fontSize: "0.82rem", color: "#8b8b9a", marginBottom: "10px", lineHeight: 1.55 }}>
            {copyText(copy, "deliveryWhyManualTheme", "")}
          </p>
          <ul style={{ ...body, fontSize: "0.85rem", paddingLeft: "1.2rem", marginBottom: "12px" }}>
            {recommended.map((check) => (
              <li key={check.id} style={{ color: check.ok ? "#a3e635" : "#c8c8d0", marginBottom: "6px" }}>
                {check.ok ? "✓" : "→"} {copyText(copy, check.labelKey, check.id)}
              </li>
            ))}
          </ul>
          {recPending > 0 && (
            <a
              href={themeUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "inline-block",
                padding: "10px 14px",
                border: "1px solid rgba(251,191,36,0.5)",
                color: "#fbbf24",
                borderRadius: "10px",
                textDecoration: "none",
                fontWeight: 600,
                fontSize: "0.88rem",
                marginRight: "8px",
              }}
            >
              {copyText(copy, "deliveryOpenTheme", "Open theme editor")}
            </a>
          )}
        </>
      )}
      {showVerify && (
        <div style={{ marginBottom: "12px", marginTop: "8px" }}>
          <p style={{ ...body, fontSize: "0.82rem", fontWeight: 600, color: "#a5b4fc", marginBottom: "4px" }}>
            {copyText(copy, "deliveryVerifySection", "")}
          </p>
          <p style={{ ...body, fontSize: "0.78rem", color: "#8b8b9a", marginBottom: "8px" }}>
            {copyText(copy, "deliveryVerifyBody", "")}
          </p>
          {richResultsUrl && (
            <a
              href={richResultsUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "inline-block",
                marginRight: "8px",
                marginBottom: "6px",
                padding: "8px 12px",
                border: "1px solid rgba(99,102,241,0.45)",
                color: "#a5b4fc",
                borderRadius: "8px",
                textDecoration: "none",
                fontWeight: 600,
                fontSize: "0.82rem",
              }}
            >
              {copyText(copy, "deliveryRichResultsTest", "Google Rich Results Test")}
            </a>
          )}
          {liveProductUrl && (
            <a
              href={liveProductUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "inline-block",
                marginBottom: "6px",
                padding: "8px 12px",
                border: "1px solid rgba(99,102,241,0.35)",
                color: "#c8c8d0",
                borderRadius: "8px",
                textDecoration: "none",
                fontWeight: 600,
                fontSize: "0.82rem",
              }}
            >
              {copyText(copy, "deliveryViewLivePage", "Your live product page")}
            </a>
          )}
        </div>
      )}
      {onRecheck && (
        <button
          type="button"
          disabled={rechecking}
          onClick={onRecheck}
          style={{
            display: "inline-block",
            padding: "10px 14px",
            border: "1px solid rgba(99,102,241,0.5)",
            color: "#a5b4fc",
            borderRadius: "10px",
            background: "transparent",
            fontWeight: 600,
            fontSize: "0.88rem",
            cursor: rechecking ? "wait" : "pointer",
          }}
        >
          {rechecking ? copyText(copy, "deliveryRechecking", "Rechecking…") : copyText(copy, "deliveryRecheckNow", "Recheck now")}
        </button>
      )}
      <p style={{ ...body, fontSize: "0.78rem", color: "#8b8b9a", marginTop: "10px", marginBottom: 0 }}>
        {copyText(copy, "deliveryRecheck", "")}
      </p>
    </div>
  );
}

export function SearchConsolePanel({ copy, searchConsole }) {
  const noteStyle = { ...body, fontSize: "0.88rem", color: "#8b8b9a", marginBottom: "10px" };
  const bullets = (
    <>
      <p style={noteStyle}>{copyText(copy, "gscWhyShopify", "")}</p>
      <p style={noteStyle}>{copyText(copy, "gscWhyGoogle", "")}</p>
      <p style={{ ...noteStyle, marginBottom: "14px", color: "#a3e635" }}>
        {copyText(copy, "gscSkipOk", "")}
      </p>
    </>
  );

  if (!searchConsole?.configured && !searchConsole?.connected) {
    return (
      <div style={card}>
        <h2 style={h2}>{copyText(copy, "gscTitle", "Google organic traffic (optional)")}</h2>
        {bullets}
        <p style={{ ...noteStyle, margin: 0 }}>{copyText(copy, "gscNotConfigured", "")}</p>
      </div>
    );
  }

  return (
    <div style={card}>
      <h2 style={h2}>{copyText(copy, "gscTitle", "Google organic traffic (optional)")}</h2>
      {bullets}
      {!searchConsole.connected ? (
        <>
          <p style={{ ...noteStyle, marginBottom: "12px" }}>{copyText(copy, "gscConnectHint", "")}</p>
          <a
            href="/app/search-console/auth"
            target="_top"
            rel="noopener noreferrer"
            style={{
              display: "inline-block",
              marginTop: "4px",
              padding: "12px 16px",
              background: "rgba(99,102,241,0.2)",
              border: "1px solid rgba(99,102,241,0.4)",
              color: "#a5b4fc",
              borderRadius: "10px",
              textDecoration: "none",
              fontWeight: 600,
            }}
          >
            {copyText(copy, "gscConnect", "Connect Google Search Console (optional)")}
          </a>
        </>
      ) : (
        <>
          {searchConsole.comparison?.hasBaseline && searchConsole.comparison?.hasLatest ? (
            <div style={{ marginBottom: "12px" }}>
              <p style={{ ...body, fontSize: "0.88rem", fontWeight: 600, color: "#a5b4fc", marginBottom: "6px" }}>
                {copyText(copy, "gscBeforeAfterTitle", "")}
              </p>
              <p style={{ ...body, fontSize: "0.88rem", marginBottom: "4px" }}>
                {copyText(copy, "gscBaseline", "")
                  .replace("{{impressions}}", String(searchConsole.comparison.baselineImpressions ?? 0))
                  .replace("{{clicks}}", String(searchConsole.comparison.baselineClicks ?? 0))}
              </p>
              <p style={{ ...body, fontSize: "0.88rem", marginBottom: "4px" }}>
                {copyText(copy, "gscLatest", "")
                  .replace("{{impressions}}", String(searchConsole.comparison.latestImpressions ?? 0))
                  .replace("{{clicks}}", String(searchConsole.comparison.latestClicks ?? 0))}
              </p>
              {searchConsole.comparison.impressionsDelta != null && (
                <p style={{ ...body, fontSize: "0.82rem", color: "#8b8b9a" }}>
                  {copyText(copy, "gscDeltaImpressions", "").replace(
                    "{{delta}}",
                    (searchConsole.comparison.impressionsDelta >= 0 ? "+" : "") +
                      String(searchConsole.comparison.impressionsDelta),
                  )}
                  {" · "}
                  {copyText(copy, "gscDeltaClicks", "").replace(
                    "{{delta}}",
                    (searchConsole.comparison.clicksDelta >= 0 ? "+" : "") +
                      String(searchConsole.comparison.clicksDelta),
                  )}
                </p>
              )}
            </div>
          ) : searchConsole.connected ? (
            <p style={{ ...body, fontSize: "0.88rem", color: "#8b8b9a", marginBottom: "8px" }}>
              {copyText(copy, "gscAwaitingBaseline", "")}
            </p>
          ) : null}
          <p style={body}>
            {searchConsole.totalImpressions != null
              ? copyText(copy, "gscSummary", "")
                  .replace("{{impressions}}", String(searchConsole.totalImpressions))
                  .replace("{{clicks}}", String(searchConsole.totalClicks))
              : copyText(copy, "gscConnected", "Connected")}
          </p>
        </>
      )}
    </div>
  );
}

export function MarketsChangedBanner({ copy, marketsWatch }) {
  if (!marketsWatch?.changed) return null;
  return (
    <div style={{ ...card, borderColor: "rgba(251,191,36,0.5)", background: "rgba(251,191,36,0.1)" }}>
      <p style={{ ...body, color: "#fbbf24", margin: 0, fontWeight: 600 }}>
        {copyText(copy, "marketsChangedBanner", "")}
      </p>
    </div>
  );
}
