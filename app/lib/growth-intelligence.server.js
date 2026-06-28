import prisma from "../db.server.js";
import { askGeminiWithTimeout } from "./gemini.server.js";
import { fetchPamMetaIntelligence } from "./predictacore-ads-client.server.js";
import { fetchRecentOrdersAttribution, fetchShopStoreAnalytics } from "./shopify-store-analytics.server.js";
import {
  fetchSearchConsoleSummary,
  getGscComparison,
  isSearchConsoleConfigured,
} from "./search-console.server.js";
import { getApplyImpactReport } from "./apply-impact.server.js";

function round2(n) {
  return Math.round(n * 100) / 100;
}

function buildVerdict({ meta, shopify, seo, gsc }) {
  const spend = meta?.funnel?.meta?.spendUsd ?? meta?.period?.totals?.spend ?? 0;
  const clicks = meta?.funnel?.meta?.linkClicks ?? 0;
  const pixelPurchases = meta?.funnel?.meta?.pixelPurchases ?? 0;
  const sessions = shopify?.totalSessions ?? 0;
  const orders = shopify?.totalOrders ?? 0;
  const sessionCr = sessions > 0 ? round2((orders / sessions) * 100) : null;
  const verdictKind = meta?.funnel?.verdict?.kind ?? "unknown";

  let headlineEs = "Datos insuficientes para veredicto.";
  let headlineEn = "Not enough data for a verdict.";

  if (verdictKind === "vanity_risk") {
    headlineEs = `Riesgo vanidoso: ~$${round2(spend)} en ${clicks} clics Meta, 0 compras pixel. Tienda: ${sessions.toLocaleString()} sesiones, ${orders} pedidos (${sessionCr ?? "?"}% conv.). El anuncio trae tráfico sin intención de compra o la landing/creativo no cierra.`;
    headlineEn = `Vanity risk: ~$${round2(spend)} on ${clicks} Meta clicks, 0 pixel purchases. Store: ${sessions.toLocaleString()} sessions, ${orders} orders (${sessionCr ?? "?"}% conv.). Ad traffic lacks purchase intent or creative/landing fails.`;
  } else if (pixelPurchases > 0) {
    headlineEs = `Meta reporta ${pixelPurchases} compra(s) en el periodo. Cruza con pedidos Shopify (${orders}) para validar atribución.`;
    headlineEn = `Meta reports ${pixelPurchases} purchase(s). Cross-check Shopify orders (${orders}) for attribution.`;
  }

  const actionsEs = [];
  const actionsEn = [];

  if (meta?.runningLaunch?.isRunning && pixelPurchases === 0) {
    actionsEs.push("Pausar campaña de tráfico activa y relanzar con objetivo Purchase.");
    actionsEn.push("Pause active traffic campaign and relaunch with Purchase objective.");
  }
  if (meta?.runningLaunch?.photoSource === "upload") {
    actionsEs.push("Reemplazar imagen WhatsApp por foto de producto Shopify con personalización visible.");
    actionsEn.push("Replace WhatsApp image with Shopify product photo showing personalization.");
  }
  if ((meta?.messageMatch?.score ?? 100) < 55) {
    actionsEs.push(`Message match bajo (${meta?.messageMatch?.score}/100) — alinear landing ${meta?.messageMatch?.landingUrl ?? ""} con promesa del anuncio.`);
    actionsEn.push(`Low message match (${meta?.messageMatch?.score}/100) — align landing with ad promise.`);
  }
  if (seo?.catalogScore != null && seo.catalogScore >= 85) {
    actionsEs.push(`SEO PredictaCore sólido (${seo.catalogScore}/100) — efecto orgánico/IA en semanas, no compensa hoy fallo de conversión pagada.`);
    actionsEn.push(`Strong PredictaCore SEO (${seo.catalogScore}/100) — organic/AI lift takes weeks; does not fix paid conversion today.`);
  }
  if (gsc?.connected && (gsc.totalClicks ?? 0) > 0) {
    actionsEs.push(`Google orgánico: ${gsc.totalClicks} clics (28d) — canal complementario, no sustituto de Meta mal optimizado.`);
    actionsEn.push(`Google organic: ${gsc.totalClicks} clicks (28d) — complementary, not a substitute for broken Meta funnel.`);
  }

  return { headlineEs, headlineEn, actionsEs, actionsEn, verdictKind, sessionCr };
}

async function buildAiBrief(intelligence, locale = "es") {
  if (!process.env.GEMINI_API_KEY?.trim()) {
    return {
      available: false,
      textEs: "GEMINI_API_KEY no configurada — síntesis AI desactivada.",
      textEn: "GEMINI_API_KEY not set — AI synthesis disabled.",
    };
  }

  const lang = locale === "es" ? "español" : "English";
  const payload = {
    meta: {
      spend: intelligence.meta?.period?.totals?.spend,
      clicks: intelligence.meta?.funnel?.meta?.linkClicks,
      pixelPurchases: intelligence.meta?.funnel?.meta?.pixelPurchases,
      messageMatch: intelligence.meta?.messageMatch?.score,
      running: intelligence.meta?.runningLaunch?.conceptName,
    },
    shopify: {
      sessions: intelligence.shopify?.totalSessions,
      orders: intelligence.shopify?.totalOrders,
      topReferrers: intelligence.shopify?.referrers?.slice(0, 5),
      metaSharePct: intelligence.shopify?.metaSharePct,
    },
    google: intelligence.gsc,
    seo: intelligence.seo,
    verdict: intelligence.verdict,
  };

  const prompt = `Eres el analista de crecimiento de PredictaCore para Pam & Ander (regalos personalizados para bebé).
Responde en ${lang}. Máximo 12 bullets cortos + 1 párrafo de decisión ejecutiva.
Prioriza: Meta Ads, tráfico Shopify por fuente, Google Search Console, SEO/AI readiness.
Sé directo sobre qué PAUSAR, qué RELANZAR y qué NO tocar todavía.
Datos JSON:
${JSON.stringify(payload, null, 2)}`;

  try {
    const text = await askGeminiWithTimeout(prompt, 50_000);
    return { available: true, text, model: "gemini-2.5-flash" };
  } catch (err) {
    return {
      available: false,
      error: err instanceof Error ? err.message : "AI failed",
    };
  }
}

export async function buildGrowthIntelligence({ admin, shop, days = 30, locale = "es", includeAi = true }) {
  const [shopify, meta, gscSummary, gscComparison, applyReport, entityProfile, recentOrders] =
    await Promise.all([
      fetchShopStoreAnalytics(admin, days),
      fetchPamMetaIntelligence({ days, locale }),
      fetchSearchConsoleSummary(shop).catch(() => ({ connected: false })),
      getGscComparison(shop).catch(() => ({ connected: false })),
      getApplyImpactReport(shop).catch(() => null),
      prisma.entityProfile.findUnique({ where: { shop } }).catch(() => null),
      fetchRecentOrdersAttribution(admin, 8).catch(() => []),
    ]);

  const seo = {
    catalogScore: applyReport?.scoreAfter ?? applyReport?.catalogScoreAfter ?? applyReport?.scoreBefore ?? null,
    foundationScore: applyReport?.foundationScoreAfter ?? applyReport?.foundationScoreBefore ?? null,
    productsOptimized: applyReport?.productsUpdated ?? applyReport?.productCount ?? null,
    schemaActive: entityProfile?.schemaActive ?? false,
    applyReportAt: applyReport?.appliedAt ?? null,
    source: "PredictaCore pilot DB (Apply report + EntityProfile)",
  };

  const gsc = {
    configured: isSearchConsoleConfigured(),
    ...gscSummary,
    comparison: gscComparison,
    source: "Google Search Console OAuth (pilot DB)",
  };

  const verdict = buildVerdict({ meta, shopify, seo, gsc: gscSummary });

  const intelligence = {
    shop,
    periodDays: days,
    locale,
    fetchedAt: new Date().toISOString(),
    sources: {
      shopify: shopify.source ?? "Shopify Admin (embedded session)",
      meta: meta.connected ? meta.sources?.meta : meta.error,
      google: gsc.configured ? "Google Search Console" : "GOOGLE_CLIENT_ID/SECRET en pilot",
      seo: seo.source,
      ai: process.env.GEMINI_API_KEY ? "Gemini 2.5 Flash (pilot)" : "GEMINI_API_KEY pendiente",
    },
    shopify,
    meta,
    gsc,
    seo,
    recentOrders,
    verdict,
  };

  if (includeAi) {
    intelligence.aiBrief = await buildAiBrief(intelligence, locale);
  }

  return intelligence;
}
