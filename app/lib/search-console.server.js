import prisma from "../db.server.js";
import { getShopifyAppUrl } from "./env.server.js";

const GSC_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";

export function isSearchConsoleConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim());
}

export function getSearchConsoleRedirectUri() {
  return `${getShopifyAppUrl()}/search-console/callback`;
}

export function buildSearchConsoleAuthUrl(shop, state) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = getSearchConsoleRedirectUri();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GSC_SCOPE,
    access_type: "offline",
    prompt: "consent",
    state: `${shop}::${state}`,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeSearchConsoleCode(code) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: getSearchConsoleRedirectUri(),
      grant_type: "authorization_code",
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.error || "OAuth failed");
  return data;
}

export async function resolveSearchConsoleSiteUrl(accessToken, shop) {
  const res = await fetch("https://www.googleapis.com/webmasters/v3/sites", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return `https://${shop}/`;

  const data = await res.json();
  const sites = (data.siteEntry ?? []).map((s) => s.siteUrl).filter(Boolean);
  if (!sites.length) return `https://${shop}/`;

  const handle = shop.replace(".myshopify.com", "");
  const candidates = [
    `https://${shop}/`,
    `https://${handle}.com/`,
    `https://www.${handle}.com/`,
    `sc-domain:${handle}.com`,
    `sc-domain:${shop}`,
  ];

  for (const candidate of candidates) {
    if (sites.includes(candidate)) return candidate;
  }

  const partial = sites.find(
    (url) => url.includes(handle) || url.includes(shop.replace(".myshopify.com", "")),
  );
  return partial ?? sites[0];
}

export async function saveSearchConsoleTokens(shop, tokens, siteUrl = null) {
  const expiresAt = tokens.expires_in
    ? new Date(Date.now() + tokens.expires_in * 1000)
    : null;
  return prisma.searchConsoleConnection.upsert({
    where: { shop },
    create: {
      shop,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? null,
      expiresAt,
      siteUrl,
    },
    update: {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? undefined,
      expiresAt,
      siteUrl: siteUrl ?? undefined,
    },
  });
}

export async function getSearchConsoleConnection(shop) {
  return prisma.searchConsoleConnection.findUnique({ where: { shop } });
}

async function refreshAccessToken(connection) {
  if (!connection.refreshToken) return connection.accessToken;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: connection.refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || "Token refresh failed");
  await saveSearchConsoleTokens(connection.shop, data, connection.siteUrl);
  return data.access_token;
}

export async function fetchSearchConsoleSummary(shop) {
  const connection = await getSearchConsoleConnection(shop);
  if (!connection?.accessToken) return { connected: false };

  let token = connection.accessToken;
  if (connection.expiresAt && connection.expiresAt < new Date()) {
    token = await refreshAccessToken(connection);
  }

  const siteUrl = connection.siteUrl;
  if (!siteUrl) {
    return { connected: true, siteUrl: null, needsSiteSelection: true };
  }

  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - 28);

  const url = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      startDate: start.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10),
      rowLimit: 1,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    return { connected: true, siteUrl, error: err.slice(0, 200) };
  }

  const data = await res.json();
  const rows = data.rows ?? [];
  const totalClicks = rows.reduce((s, r) => s + (r.clicks ?? 0), 0);
  const totalImpressions = rows.reduce((s, r) => s + (r.impressions ?? 0), 0);

  const countryRes = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      startDate: start.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10),
      dimensions: ["country"],
      rowLimit: 10,
    }),
  });
  const countryData = countryRes.ok ? await countryRes.json() : { rows: [] };
  const countryRows = countryData.rows ?? [];

  return {
    connected: true,
    siteUrl,
    periodDays: 28,
    totalClicks,
    totalImpressions,
    topCountries: countryRows.slice(0, 5).map((r) => ({
      country: r.keys?.[0] ?? "",
      clicks: r.clicks ?? 0,
      impressions: r.impressions ?? 0,
    })),
  };
}

async function fetchGscMetrics(connection) {
  let token = connection.accessToken;
  if (connection.expiresAt && connection.expiresAt < new Date()) {
    token = await refreshAccessToken(connection);
  }

  const siteUrl = connection.siteUrl;
  if (!siteUrl) return null;

  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - 28);

  const url = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      startDate: start.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10),
      rowLimit: 1,
    }),
  });

  if (!res.ok) return null;

  const data = await res.json();
  const rows = data.rows ?? [];
  const totalClicks = rows.reduce((s, r) => s + (r.clicks ?? 0), 0);
  const totalImpressions = rows.reduce((s, r) => s + (r.impressions ?? 0), 0);
  return { totalClicks, totalImpressions, capturedAt: new Date() };
}

/** Snapshot organic metrics at Apply time (before). */
export async function captureGscBaseline(shop) {
  const connection = await getSearchConsoleConnection(shop);
  if (!connection?.accessToken || !connection.siteUrl) return null;

  const metrics = await fetchGscMetrics(connection);
  if (!metrics) return null;

  await prisma.searchConsoleConnection.update({
    where: { shop },
    data: {
      baselineImpressions: metrics.totalImpressions,
      baselineClicks: metrics.totalClicks,
      baselineCapturedAt: metrics.capturedAt,
    },
  });

  return metrics;
}

/** Refresh latest metrics; optionally mark Apply date for before/after comparison. */
export async function captureGscLatest(shop, { markApply = false } = {}) {
  const connection = await getSearchConsoleConnection(shop);
  if (!connection?.accessToken || !connection.siteUrl) return null;

  const metrics = await fetchGscMetrics(connection);
  if (!metrics) return null;

  await prisma.searchConsoleConnection.update({
    where: { shop },
    data: {
      latestImpressions: metrics.totalImpressions,
      latestClicks: metrics.totalClicks,
      latestCapturedAt: metrics.capturedAt,
      ...(markApply ? { applyMarkerAt: metrics.capturedAt } : {}),
    },
  });

  return metrics;
}

export async function getGscComparison(shop) {
  const connection = await getSearchConsoleConnection(shop);
  if (!connection?.accessToken) return { connected: false };

  const baselineImpressions = connection.baselineImpressions;
  const baselineClicks = connection.baselineClicks;
  const latestImpressions = connection.latestImpressions;
  const latestClicks = connection.latestClicks;

  const hasBaseline = baselineImpressions != null || baselineClicks != null;
  const hasLatest = latestImpressions != null || latestClicks != null;

  return {
    connected: true,
    siteUrl: connection.siteUrl,
    hasBaseline,
    hasLatest,
    baselineImpressions: baselineImpressions ?? null,
    baselineClicks: baselineClicks ?? null,
    baselineCapturedAt: connection.baselineCapturedAt?.toISOString?.() ?? null,
    latestImpressions: latestImpressions ?? null,
    latestClicks: latestClicks ?? null,
    latestCapturedAt: connection.latestCapturedAt?.toISOString?.() ?? null,
    applyMarkerAt: connection.applyMarkerAt?.toISOString?.() ?? null,
    impressionsDelta:
      hasBaseline && hasLatest ? (latestImpressions ?? 0) - (baselineImpressions ?? 0) : null,
    clicksDelta: hasBaseline && hasLatest ? (latestClicks ?? 0) - (baselineClicks ?? 0) : null,
  };
}
