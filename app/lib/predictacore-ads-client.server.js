import { getPredictacoreAdsInternalSecret, getPredictacoreAdsOrigin } from "./env.server.js";

function adsHeaders() {
  const secret = getPredictacoreAdsInternalSecret();
  const headers = { Accept: "application/json" };
  if (secret) headers["x-pilot-internal-secret"] = secret;
  return headers;
}

async function fetchAdsJson(path, { timeoutMs = 45_000 } = {}) {
  const origin = getPredictacoreAdsOrigin();
  const url = `${origin}${path.startsWith("/") ? path : `/${path}`}`;
  const res = await fetch(url, {
    headers: adsHeaders(),
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json.error ?? `predictacore-ads ${res.status}`);
  }
  return json;
}

export async function fetchPamMetaIntelligence({ days = 30, locale = "es" } = {}) {
  const secret = getPredictacoreAdsInternalSecret();

  try {
    const data = await fetchAdsJson(
      `/api/internal/pam-intelligence?days=${days}&locale=${locale}`,
      { timeoutMs: 90_000 },
    );
    return { connected: true, ...data };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Meta intelligence failed";
    if (!secret && message.includes("No autorizado")) {
      return {
        connected: false,
        error:
          "Copia META_CRON_SECRET de predictacore-ads → PREDICTACORE_ADS_INTERNAL_SECRET en el pilot (mismo valor).",
      };
    }
    return { connected: false, error: message };
  }
}

export async function executePamGrowthAction(action, { dailyBudgetUsd = 15 } = {}) {
  const secret = getPredictacoreAdsInternalSecret();
  if (!secret) {
    throw new Error(
      "PREDICTACORE_ADS_INTERNAL_SECRET no configurado — copia META_CRON_SECRET de predictacore-ads.",
    );
  }

  const origin = getPredictacoreAdsOrigin();
  const res = await fetch(`${origin}/api/campaign/growth/execute`, {
    method: "POST",
    headers: { ...adsHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({
      clientSlug: "pam-andander",
      action,
      confirm: true,
      dailyBudgetUsd,
    }),
    signal: AbortSignal.timeout(120_000),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `Action failed (${res.status})`);
  return json;
}
