/**
 * Producto por producto: qué se vende hoy (sales) y qué es capaz de venderse (embudo PDP + catálogo).
 * predictacore.ai/ads consume esto para elegir a qué producto dirigir el anuncio.
 */

const PRODUCT_LIMIT = 40;

function toNumber(value) {
  const n = Number.parseFloat(String(value ?? "0").replace(/[,$%]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function rowsFromTable(table) {
  return table?.tableData?.rows ?? [];
}

function normalizeProductGid(value) {
  if (value == null || value === "") return null;
  const text = String(value).trim();
  if (text.startsWith("gid://shopify/Product/")) return text;
  if (/^\d+$/.test(text)) return `gid://shopify/Product/${text}`;
  return text;
}

/** `/products/mi-manta?variant=1` → `mi-manta`. Devuelve null para colecciones, home, etc. */
export function productHandleFromPath(path) {
  if (!path) return null;
  const clean = String(path).split("?")[0].split("#")[0];
  const match = clean.match(/\/products\/([^/]+)/);
  return match ? decodeURIComponent(match[1]).toLowerCase() : null;
}

/**
 * ShopifyQL cambia nombres de columnas entre versiones y `gross_profit` solo existe
 * si la tienda registra costos. Cada consulta va de la más rica a la más pobre.
 */
function salesQueries(since) {
  const base = `GROUP BY product_id, product_title SINCE ${since} ORDER BY net_sales DESC LIMIT ${PRODUCT_LIMIT}`;
  return [
    `FROM sales SHOW orders, total_sales, net_sales, net_items_sold, gross_profit, gross_margin, returned_quantity_rate ${base}`,
    `FROM sales SHOW orders, total_sales, net_sales, net_items_sold, gross_profit ${base}`,
    `FROM sales SHOW orders, total_sales, net_sales, net_items_sold ${base}`,
    `FROM sales SHOW orders, total_sales GROUP BY product_id, product_title SINCE ${since} ORDER BY total_sales DESC LIMIT ${PRODUCT_LIMIT}`,
  ];
}

/** Embudo por página de producto. El filtro de bots importa: esta tienda tiene tráfico inflado. */
function funnelQueries(since) {
  const order = `SINCE ${since} ORDER BY sessions DESC LIMIT 250`;
  return [
    `FROM sessions SHOW sessions, conversion_rate, added_to_cart_rate, sessions_with_cart_additions, sessions_that_completed_checkout WHERE human_or_bot_session = 'human' AND landing_page_type = 'product' GROUP BY landing_page_path ${order}`,
    `FROM sessions SHOW sessions, conversion_rate, added_to_cart_rate, sessions_with_cart_additions, sessions_that_completed_checkout WHERE human_or_bot_session = 'human' GROUP BY landing_page_path ${order}`,
    `FROM sessions SHOW sessions, conversion_rate, sessions_with_cart_additions, sessions_that_completed_checkout GROUP BY landing_page_path ${order}`,
    `FROM sessions SHOW sessions, sessions_that_completed_checkout GROUP BY landing_page_path ${order}`,
  ];
}

const CATALOG_FIELDS = `
  id
  title
  handle
  productType
  vendor
  tags
  status
  totalInventory
  tracksInventory
  hasOutOfStockVariants
  onlineStoreUrl
  featuredImage { url altText width height }
  priceRangeV2 { minVariantPrice { amount currencyCode } maxVariantPrice { amount currencyCode } }
  seo { title description }
`;

/** El servicio de ads necesita saber qué dominios son de esta tienda y cuáles no. */
async function fetchShopDomains(shopifyGraphql) {
  try {
    const data = await shopifyGraphql(
      `query PredictaCoreShopDomains {
        shop {
          myshopifyDomain
          primaryDomain { host }
        }
      }`,
    );
    return data?.shop ?? null;
  } catch {
    return null;
  }
}

async function fetchCatalogByIds(shopifyGraphql, ids) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return new Map();

  const byId = new Map();
  for (let i = 0; i < unique.length; i += 50) {
    const chunk = unique.slice(i, i + 50);
    try {
      const data = await shopifyGraphql(
        `query PredictaCoreProductIntel($ids: [ID!]!) {
          nodes(ids: $ids) { ... on Product { ${CATALOG_FIELDS} } }
        }`,
        { ids: chunk },
      );
      for (const node of data?.nodes ?? []) {
        if (node?.id) byId.set(node.id, node);
      }
    } catch {
      // Un chunk fallido no invalida el ranking — seguimos con datos parciales.
    }
  }
  return byId;
}

/** Productos con tráfico pero sin ventas en el periodo: no aparecen en `FROM sales`. */
async function fetchCatalogByHandles(shopifyGraphql, handles) {
  const unique = [...new Set(handles.filter(Boolean))].slice(0, 30);
  if (unique.length === 0) return [];

  const query = unique.map((h) => `handle:${JSON.stringify(h)}`).join(" OR ");
  try {
    const data = await shopifyGraphql(
      `query PredictaCoreProductIntelByHandle($query: String!, $first: Int!) {
        products(first: $first, query: $query) { nodes { ${CATALOG_FIELDS} } }
      }`,
      { query, first: unique.length },
    );
    return data?.products?.nodes ?? [];
  } catch {
    return [];
  }
}

/** Escala 0-100 relativa al mejor valor del conjunto. */
function normalizeTo100(value, max) {
  if (!Number.isFinite(value) || value <= 0 || !Number.isFinite(max) || max <= 0) return 0;
  return Math.round(Math.min(100, (value / max) * 100));
}

function round(value, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round((Number(value) || 0) * factor) / factor;
}

/**
 * Vendibilidad: probabilidad de que el producto convierta si le ponemos presupuesto.
 * Pondera cómo convierte su propia página por encima de cuánto vendió ya, para que
 * un producto pequeño pero muy eficiente pueda ganarle a un best seller estancado.
 */
function buildScores(rows) {
  const maxRevenue = Math.max(0, ...rows.map((r) => r.netSales));
  const maxSessions = Math.max(0, ...rows.map((r) => r.sessions));
  const maxConversion = Math.max(0, ...rows.map((r) => r.conversionRatePct));
  const maxAtc = Math.max(0, ...rows.map((r) => r.addedToCartRatePct));
  const maxOrders = Math.max(0, ...rows.map((r) => r.orders));

  return rows.map((row) => {
    const revenueScore = normalizeTo100(row.netSales, maxRevenue);
    const demandScore = normalizeTo100(row.sessions, maxSessions);
    const conversionScore = normalizeTo100(row.conversionRatePct, maxConversion);
    const cartScore = normalizeTo100(row.addedToCartRatePct, maxAtc);

    const soldScore = Math.round(
      revenueScore * 0.7 + normalizeTo100(row.orders, maxOrders) * 0.3,
    );

    let sellableScore =
      conversionScore * 0.4 + cartScore * 0.2 + revenueScore * 0.25 + demandScore * 0.15;

    // Sin inventario no hay anuncio que valga: el clic se paga y el carrito se pierde.
    if (row.inStock === false) sellableScore *= 0.25;
    if (row.status && row.status !== "ACTIVE") sellableScore *= 0.2;
    if (row.returnRatePct > 10) sellableScore *= 0.75;

    const blockers = [];
    if (row.inStock === false) blockers.push("sin_inventario");
    if (row.status && row.status !== "ACTIVE") blockers.push("no_activo");
    if (!row.image) blockers.push("sin_imagen");
    if (!row.url) blockers.push("sin_url_publica");
    if (row.returnRatePct > 10) blockers.push("devoluciones_altas");

    return {
      ...row,
      revenueScore,
      demandScore,
      conversionScore,
      soldScore,
      sellableScore: Math.round(sellableScore),
      adReady: blockers.length === 0,
      blockers,
    };
  });
}

/**
 * @param shopifyGraphql (query, variables) => data — ya autenticado contra la tienda.
 */
export async function fetchProductIntelligence(shopifyGraphql, tryShopifyQl, since) {
  const [salesResult, funnelResult, shopDomains] = await Promise.all([
    tryShopifyQl(salesQueries(since)).catch((err) => ({ error: err })),
    tryShopifyQl(funnelQueries(since)).catch((err) => ({ error: err })),
    fetchShopDomains(shopifyGraphql),
  ]);

  const salesRows = rowsFromTable(salesResult?.table);
  const funnelRows = rowsFromTable(funnelResult?.table);

  // Embudo indexado por handle de producto.
  const funnelByHandle = new Map();
  for (const row of funnelRows) {
    const handle = productHandleFromPath(row.landing_page_path ?? row.landing_page_url);
    if (!handle) continue;
    const sessions = toNumber(row.sessions);
    const checkouts = toNumber(row.sessions_that_completed_checkout);
    const carts = toNumber(row.sessions_with_cart_additions);
    const prev = funnelByHandle.get(handle);
    const merged = {
      sessions: (prev?.sessions ?? 0) + sessions,
      checkouts: (prev?.checkouts ?? 0) + checkouts,
      carts: (prev?.carts ?? 0) + carts,
      // conversion_rate viene ya calculado por Shopify; lo guardamos como respaldo.
      reportedConversionPct: toNumber(row.conversion_rate) || prev?.reportedConversionPct || 0,
      reportedAtcPct: toNumber(row.added_to_cart_rate) || prev?.reportedAtcPct || 0,
    };
    funnelByHandle.set(handle, merged);
  }

  const salesById = new Map();
  for (const row of salesRows) {
    const productId = normalizeProductGid(row.product_id ?? row.productId);
    if (!productId) continue;
    salesById.set(productId, {
      productId,
      title: String(row.product_title ?? "").trim(),
      orders: toNumber(row.orders),
      totalSales: toNumber(row.total_sales),
      netSales: toNumber(row.net_sales ?? row.total_sales),
      unitsSold: toNumber(row.net_items_sold),
      grossProfit: toNumber(row.gross_profit),
      grossMarginPct: toNumber(row.gross_margin),
      returnRatePct: toNumber(row.returned_quantity_rate),
    });
  }

  const catalogById = await fetchCatalogByIds(shopifyGraphql, [...salesById.keys()]);

  // Handles con tráfico real que no vendieron nada: la mayor oportunidad de anuncio.
  const soldHandles = new Set(
    [...catalogById.values()].map((p) => String(p.handle ?? "").toLowerCase()),
  );
  const trafficOnlyHandles = [...funnelByHandle.entries()]
    .filter(([handle, f]) => !soldHandles.has(handle) && f.sessions >= 20)
    .sort((a, b) => b[1].sessions - a[1].sessions)
    .map(([handle]) => handle);

  const extraProducts = await fetchCatalogByHandles(shopifyGraphql, trafficOnlyHandles);

  const merge = (product, sales) => {
    const handle = String(product?.handle ?? "").toLowerCase();
    const funnel = funnelByHandle.get(handle);
    const sessions = funnel?.sessions ?? 0;
    const checkouts = funnel?.checkouts ?? 0;
    const carts = funnel?.carts ?? 0;

    // Preferimos la tasa derivada de conteos crudos; el % reportado es el respaldo.
    const conversionRatePct =
      sessions > 0 ? round((checkouts / sessions) * 100) : round(funnel?.reportedConversionPct ?? 0);
    const addedToCartRatePct =
      sessions > 0 ? round((carts / sessions) * 100) : round(funnel?.reportedAtcPct ?? 0);

    const price = toNumber(product?.priceRangeV2?.minVariantPrice?.amount);
    const inventory = product?.totalInventory;

    /**
     * Sin seguimiento de inventario Shopify reporta 0, que no significa agotado.
     * Pam vende productos personalizados bajo pedido: tratarlos como agotados los
     * dejaría fuera de todo anuncio.
     */
    const tracksInventory = product?.tracksInventory !== false;
    const inStock = !tracksInventory
      ? true
      : typeof inventory === "number"
        ? inventory > 0
        : product?.hasOutOfStockVariants === true
          ? false
          : null;

    return {
      productId: product?.id ?? sales?.productId ?? null,
      handle: handle || null,
      title: product?.title ?? sales?.title ?? "",
      productType: product?.productType ?? null,
      status: product?.status ?? null,
      url: product?.onlineStoreUrl ?? null,
      image: product?.featuredImage?.url ?? null,
      imageAlt: product?.featuredImage?.altText ?? null,
      price,
      currency: product?.priceRangeV2?.minVariantPrice?.currencyCode ?? "USD",
      inventory: Number.isFinite(inventory) ? inventory : null,
      tracksInventory,
      inStock,
      orders: sales?.orders ?? 0,
      unitsSold: sales?.unitsSold ?? 0,
      netSales: round(sales?.netSales ?? 0),
      grossProfit: round(sales?.grossProfit ?? 0),
      grossMarginPct: round(sales?.grossMarginPct ?? 0),
      returnRatePct: round(sales?.returnRatePct ?? 0),
      sessions,
      conversionRatePct,
      addedToCartRatePct,
      seoTitle: product?.seo?.title ?? null,
      seoDescription: product?.seo?.description ?? null,
      tags: product?.tags ?? [],
    };
  };

  const merged = [
    ...[...salesById.values()].map((sales) => merge(catalogById.get(sales.productId), sales)),
    ...extraProducts.map((product) => merge(product, null)),
  ].filter((row) => row.handle || row.title);

  const scored = buildScores(merged);

  const topSellers = [...scored].sort((a, b) => b.soldScore - a.soldScore).slice(0, 12);
  const mostSellable = [...scored]
    .filter((r) => r.adReady)
    .sort((a, b) => b.sellableScore - a.sellableScore)
    .slice(0, 12);

  // Convierten mejor que el promedio pero venden poco: les falta tráfico, no producto.
  const avgConversion =
    scored.length > 0
      ? scored.reduce((sum, r) => sum + r.conversionRatePct, 0) / scored.length
      : 0;
  const opportunities = [...scored]
    .filter((r) => r.adReady && r.conversionRatePct > avgConversion && r.revenueScore < 50)
    .sort((a, b) => b.conversionRatePct - a.conversionRatePct)
    .slice(0, 8);

  const errors = [];
  if (salesResult?.error) {
    errors.push(`sales: ${String(salesResult.error?.message ?? salesResult.error).slice(0, 160)}`);
  }
  if (funnelResult?.error) {
    errors.push(`funnel: ${String(funnelResult.error?.message ?? funnelResult.error).slice(0, 160)}`);
  }

  return {
    connected: scored.length > 0,
    count: scored.length,
    shopDomains: [shopDomains?.primaryDomain?.host, shopDomains?.myshopifyDomain].filter(Boolean),
    hasFunnelData: funnelByHandle.size > 0,
    hasProfitData: scored.some((r) => r.grossProfit > 0),
    avgConversionRatePct: round(avgConversion),
    topSellers,
    mostSellable,
    opportunities,
    all: scored,
    queries: {
      sales: salesResult?.query ?? null,
      funnel: funnelResult?.query ?? null,
    },
    error: errors.length > 0 ? errors.join(" | ") : undefined,
  };
}
