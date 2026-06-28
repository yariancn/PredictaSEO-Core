const API_VERSION = "2026-04";

function toNumber(value) {
  const n = Number.parseFloat(String(value ?? "0").replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function rowsFromTable(table) {
  return table?.tableData?.rows ?? table?.rows ?? [];
}

function sinceDate(days) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

async function runShopifyQl(admin, query) {
  const response = await admin.graphql(
    `#graphql
    query PredictaCoreShopifyQl($query: String!) {
      shopifyqlQuery(query: $query) {
        tableData { columns { name } rows }
        parseErrors
      }
    }`,
    { variables: { query } },
  );
  const { data, errors } = await response.json();
  if (errors?.length) throw new Error(errors.map((e) => e.message).join("; "));
  const table = data?.shopifyqlQuery;
  if (table?.parseErrors?.length) throw new Error(table.parseErrors.join("; "));
  return table;
}

export async function fetchShopStoreAnalytics(admin, days = 30) {
  const since = sinceDate(days);
  const empty = {
    connected: false,
    periodSince: since,
    periodDays: days,
    totalSessions: 0,
    totalOrders: 0,
    referrers: [],
    daily: [],
    salesByChannel: [],
    deviceBreakdown: [],
    botSuspicionNoteEs: "",
    botSuspicionNoteEn: "",
  };

  try {
    const [referrerTable, dailyTable, salesTable, deviceTable] = await Promise.all([
      runShopifyQl(
        admin,
        `FROM sessions SHOW sessions, pageviews GROUP BY session_referrer_source SINCE ${since} ORDER BY sessions DESC LIMIT 20`,
      ),
      runShopifyQl(
        admin,
        `FROM sessions SHOW sessions, online_store_visitors, pageviews WHERE session_start >= '${since}' GROUP BY day ORDER BY day`,
      ),
      runShopifyQl(admin, `FROM sales SHOW orders, total_sales GROUP BY sales_channel SINCE ${since}`),
      runShopifyQl(
        admin,
        `FROM sessions SHOW sessions, pageviews GROUP BY session_device_type SINCE ${since} ORDER BY sessions DESC`,
      ),
    ]);

    const referrerRows = rowsFromTable(referrerTable);
    const totalSessions = referrerRows.reduce((sum, r) => sum + toNumber(r.sessions), 0);

    const referrers = referrerRows.map((r) => {
      const sessions = toNumber(r.sessions);
      return {
        source: String(r.session_referrer_source ?? r.referrer ?? "unknown"),
        sessions,
        pageviews: toNumber(r.pageviews),
        sharePct: totalSessions > 0 ? Math.round((sessions / totalSessions) * 1000) / 10 : 0,
      };
    });

    const daily = rowsFromTable(dailyTable).map((r) => ({
      day: String(r.day ?? ""),
      sessions: toNumber(r.sessions),
      visitors: toNumber(r.online_store_visitors),
      pageviews: toNumber(r.pageviews),
    }));

    const salesByChannel = rowsFromTable(salesTable).map((r) => ({
      channel: String(r.sales_channel ?? "unknown"),
      orders: toNumber(r.orders),
      sales: toNumber(r.total_sales),
    }));

    const deviceBreakdown = rowsFromTable(deviceTable).map((r) => ({
      device: String(r.session_device_type ?? "unknown"),
      sessions: toNumber(r.sessions),
      pageviews: toNumber(r.pageviews),
    }));

    const totalOrders = salesByChannel.reduce((s, c) => s + c.orders, 0);
    const metaSessions =
      referrers.find((r) => /facebook|instagram|meta|fb/i.test(r.source))?.sessions ?? 0;
    const metaShare = totalSessions > 0 ? (metaSessions / totalSessions) * 100 : 0;

    let botSuspicionNoteEs = "";
    let botSuspicionNoteEn = "";
    if (totalSessions > 2000 && totalOrders <= 2) {
      botSuspicionNoteEs = `Alto tráfico (${totalSessions.toLocaleString()} sesiones) con casi cero pedidos. Meta ~${Math.round(metaShare)}% (${metaSessions} ses.). Revisa fuentes abajo — PredictaCore SEO no genera sesiones masivas en la tienda.`;
      botSuspicionNoteEn = `High traffic (${totalSessions.toLocaleString()} sessions) with near-zero orders. Meta ~${Math.round(metaShare)}%. Review sources — PredictaCore SEO does not mass-generate store sessions.`;
    }

    return {
      connected: true,
      periodSince: since,
      periodDays: days,
      totalSessions,
      totalOrders,
      referrers,
      daily,
      salesByChannel,
      deviceBreakdown,
      metaSessions,
      metaSharePct: Math.round(metaShare * 10) / 10,
      botSuspicionNoteEs,
      botSuspicionNoteEn,
      source: "Shopify Admin API (shopifyqlQuery) — sesión embebida del pilot",
    };
  } catch (err) {
    return {
      ...empty,
      error: err instanceof Error ? err.message.slice(0, 300) : "Shopify analytics failed",
    };
  }
}

export async function fetchRecentOrdersAttribution(admin, limit = 10) {
  const response = await admin.graphql(
    `#graphql
    query PredictaCoreRecentOrders($first: Int!) {
      orders(first: $first, sortKey: CREATED_AT, reverse: true) {
        nodes {
          id
          name
          createdAt
          totalPriceSet { shopMoney { amount currencyCode } }
          customerJourneySummary {
            firstVisit { source type landingPage referrerUrl }
            lastVisit { source type landingPage referrerUrl }
          }
        }
      }
    }`,
    { variables: { first: limit } },
  );
  const { data, errors } = await response.json();
  if (errors?.length) throw new Error(errors.map((e) => e.message).join("; "));
  return (data?.orders?.nodes ?? []).map((o) => ({
    name: o.name,
    createdAt: o.createdAt,
    amount: o.totalPriceSet?.shopMoney?.amount,
    currency: o.totalPriceSet?.shopMoney?.currencyCode,
    firstVisit: o.customerJourneySummary?.firstVisit ?? null,
    lastVisit: o.customerJourneySummary?.lastVisit ?? null,
  }));
}
