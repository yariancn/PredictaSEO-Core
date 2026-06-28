import prisma from "../db.server.js";
import {
  fetchSearchConsoleSummary,
  getGscComparison,
  isSearchConsoleConfigured,
} from "./search-console.server.js";
import { getApplyImpactReport } from "./apply-impact.server.js";

const DEFAULT_SHOP = "pamandander1.myshopify.com";
/** shopifyqlQuery requires Admin API 2025-10+ (see Shopify changelog Oct 2025). */
const API_VERSION = process.env.SHOPIFY_ADMIN_API_VERSION?.trim() || "2026-04";

function pilotShop() {
  return process.env.PILOT_SHOP?.trim() || DEFAULT_SHOP;
}

function sinceDate(days) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function toNumber(value) {
  const n = Number.parseFloat(String(value ?? "0").replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function rowsFromTable(table) {
  return table?.tableData?.rows ?? [];
}

async function resolveOfflineToken(shop) {
  const session = await prisma.session.findFirst({
    where: { shop, isOnline: false },
    orderBy: { expires: "desc" },
  });
  return session?.accessToken ?? null;
}

async function shopifyGraphql(token, shop, query, variables = {}) {
  const res = await fetch(`https://${shop}/admin/api/${API_VERSION}/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": token,
    },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(30_000),
  });
  const json = await res.json();
  if (!res.ok || json.errors?.length) {
    throw new Error(JSON.stringify(json.errors ?? { status: res.status }));
  }
  return json.data;
}

async function runShopifyQl(token, shop, ql) {
  const data = await shopifyGraphql(
    token,
    shop,
    `query($query: String!) { shopifyqlQuery(query: $query) { tableData { rows } parseErrors } }`,
    { query: ql },
  );
  const table = data.shopifyqlQuery;
  if (table?.parseErrors?.length) throw new Error(table.parseErrors.join("; "));
  return table;
}

async function tryShopifyQl(token, shop, queries) {
  let lastError = "";
  for (const ql of queries) {
    try {
      const table = await runShopifyQl(token, shop, ql);
      if (rowsFromTable(table).length > 0 || !table?.parseErrors?.length) {
        return { table, query: ql };
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }
  throw new Error(lastError || "ShopifyQL failed");
}

function sourceFromRow(row) {
  return String(
    row.referrer_source ??
      row.utm_source ??
      row.session_referrer_source ??
      row.referrer ??
      row.traffic_source ??
      "unknown",
  );
}

function deviceFromRow(row) {
  return String(row.device_type ?? row.session_device_type ?? "unknown");
}

async function fetchShopifyAnalytics(token, shop, days) {
  const since = sinceDate(days);
  const empty = {
    connected: false,
    shop,
    periodSince: since,
    periodDays: days,
    totalSessions: 0,
    totalOrders: 0,
    referrers: [],
    trafficTypes: [],
    salesByChannel: [],
    deviceBreakdown: [],
    metaSessions: 0,
    metaSharePct: 0,
    botSuspicionNoteEs: "",
    botSuspicionNoteEn: "",
  };

  try {
    const [referrerResult, trafficTypeResult, totalsTable, salesTable, deviceResult] = await Promise.all([
      tryShopifyQl(token, shop, [
        `FROM sessions SHOW sessions GROUP BY referrer_source SINCE ${since} ORDER BY sessions DESC LIMIT 20`,
        `FROM sessions SHOW sessions GROUP BY utm_source SINCE ${since} ORDER BY sessions DESC LIMIT 20`,
      ]),
      tryShopifyQl(token, shop, [
        `FROM sessions SHOW sessions GROUP BY traffic_type SINCE ${since} ORDER BY sessions DESC LIMIT 10`,
      ]),
      runShopifyQl(token, shop, `FROM sessions SHOW sessions SINCE ${since}`),
      runShopifyQl(token, shop, `FROM sales SHOW orders, total_sales GROUP BY sales_channel SINCE ${since}`),
      tryShopifyQl(token, shop, [
        `FROM sessions SHOW sessions GROUP BY session_device_type SINCE ${since} ORDER BY sessions DESC`,
        `FROM sessions SHOW sessions GROUP BY device_type SINCE ${since} ORDER BY sessions DESC`,
      ]),
    ]);

    const referrerRows = rowsFromTable(referrerResult.table);
    const totalsRows = rowsFromTable(totalsTable);
    const totalFromShow = totalsRows.reduce((sum, r) => sum + toNumber(r.sessions), 0);
    const totalFromReferrers = referrerRows.reduce((sum, r) => sum + toNumber(r.sessions), 0);
    const totalSessions = totalFromShow > 0 ? totalFromShow : totalFromReferrers;

    const referrers = referrerRows.map((r) => {
      const sessions = toNumber(r.sessions);
      return {
        source: sourceFromRow(r),
        sessions,
        pageviews: toNumber(r.pageviews),
        sharePct: totalSessions > 0 ? Math.round((sessions / totalSessions) * 1000) / 10 : 0,
      };
    });

    const trafficTypes = rowsFromTable(trafficTypeResult.table).map((r) => {
      const sessions = toNumber(r.sessions);
      return {
        type: String(r.traffic_type ?? "unknown"),
        sessions,
        sharePct: totalSessions > 0 ? Math.round((sessions / totalSessions) * 1000) / 10 : 0,
      };
    });

    const salesByChannel = rowsFromTable(salesTable).map((r) => ({
      channel: String(r.sales_channel ?? "unknown"),
      orders: toNumber(r.orders),
      sales: toNumber(r.total_sales),
    }));

    const deviceBreakdown = rowsFromTable(deviceResult.table).map((r) => ({
      device: deviceFromRow(r),
      sessions: toNumber(r.sessions),
      pageviews: toNumber(r.pageviews),
    }));

    const totalOrders = salesByChannel.reduce((s, c) => s + c.orders, 0);
    const paidTrafficSessions = trafficTypes.find((t) => t.type === "paid")?.sessions ?? 0;
    const metaReferrerSessions =
      referrers.find((r) => /facebook|instagram|meta|fb|paid/i.test(r.source))?.sessions ?? 0;
    const metaSessions = Math.max(paidTrafficSessions, metaReferrerSessions);
    const metaShare = totalSessions > 0 ? (metaSessions / totalSessions) * 100 : 0;

    let botSuspicionNoteEs = "";
    let botSuspicionNoteEn = "";
    if (totalSessions > 2000 && totalOrders <= 2) {
      botSuspicionNoteEs = `Alto tráfico (${totalSessions.toLocaleString()} sesiones) con casi cero pedidos. Meta/referrer ~${Math.round(metaShare)}% (${metaSessions} ses.). El resto es orgánico/directo/bots — revisa tabla.`;
      botSuspicionNoteEn = `High traffic (${totalSessions.toLocaleString()} sessions) with near-zero orders. Meta/referrer ~${Math.round(metaShare)}% (${metaSessions} sessions). Rest is organic/direct/bots — see table.`;
    }

    return {
      connected: true,
      shop,
      periodSince: since,
      periodDays: days,
      totalSessions,
      totalOrders,
      referrers,
      trafficTypes,
      salesByChannel,
      deviceBreakdown,
      metaSessions,
      metaSharePct: Math.round(metaShare * 10) / 10,
      botSuspicionNoteEs,
      botSuspicionNoteEn,
      source: `Shopify Admin API ${API_VERSION} (referrer_source via ShopifyQL)`,
    };
  } catch (err) {
    const raw = err instanceof Error ? err.message : "Shopify analytics failed";
    let error = raw.slice(0, 300);
    if (/shopifyqlQuery.*doesn't exist/i.test(raw)) {
      error =
        "API Shopify desactualizada en el servidor pilot — requiere Admin API 2026-04 para analytics.";
    } else if (/Invalid API key or access token/i.test(raw)) {
      error = "Token Shopify inválido — abre la app pilot en Shopify Admin (OAuth automático).";
    } else if (/Column Not Found/i.test(raw)) {
      error = `ShopifyQL column mismatch (actualizando consulta): ${raw.slice(0, 120)}`;
    }
    return {
      ...empty,
      error,
    };
  }
}

export async function buildStoreIntelligencePayload(days = 30) {
  const shop = pilotShop();
  const token = await resolveOfflineToken(shop);

  const [shopify, gscSummary, gscComparison, applyReport, entityProfile] = await Promise.all([
    token
      ? fetchShopifyAnalytics(token, shop, days)
      : Promise.resolve({
          connected: false,
          shop,
          error: "Sin token offline en Session — reinstala la app pilot en la tienda.",
        }),
    fetchSearchConsoleSummary(shop).catch((err) => ({
      connected: false,
      error: err instanceof Error ? err.message.slice(0, 200) : "GSC fetch failed",
    })),
    getGscComparison(shop).catch(() => ({ connected: false })),
    getApplyImpactReport(shop).catch(() => null),
    prisma.entityProfile.findUnique({ where: { shop } }).catch(() => null),
  ]);

  return {
    shop,
    periodDays: days,
    fetchedAt: new Date().toISOString(),
    shopify,
    google: {
      configured: isSearchConsoleConfigured(),
      summary: gscSummary,
      comparison: gscComparison,
      source: "Google Search Console OAuth (pilot DB)",
    },
    seo: {
      catalogScore: applyReport?.scoreAfter ?? applyReport?.catalogScoreAfter ?? null,
      foundationScore: applyReport?.foundationScoreAfter ?? applyReport?.foundationScoreBefore ?? null,
      productsOptimized: applyReport?.productsUpdated ?? null,
      schemaActive: entityProfile?.schemaActive ?? false,
      applyReportAt: applyReport?.savedAt ?? null,
      source: "PredictaCore pilot (Apply + EntityProfile)",
    },
    sources: {
      shopify: shopify.source ?? "Shopify offline token",
      google: isSearchConsoleConfigured() ? "GSC OAuth" : "GOOGLE_CLIENT_ID/SECRET en pilot",
      seo: "pilot DATABASE_URL",
    },
  };
}
