const SALES_LOOKBACK = "-90d";
const SALES_LIMIT = 150;

const PRODUCT_FIELDS = `
  id
  title
  handle
  description
  descriptionHtml
  productType
  vendor
  tags
  status
  publishedAt
  totalInventory
  hasOutOfStockVariants
  isGiftCard
  seo { title description }
`;

const SHOPIFYQL_SALES = `FROM sales SHOW orders, total_sales GROUP BY product_id SINCE ${SALES_LOOKBACK} ORDER BY total_sales DESC LIMIT ${SALES_LIMIT}`;

function normalizeProductGid(value) {
  if (value == null || value === "") return null;
  const text = String(value).trim();
  if (text.startsWith("gid://shopify/Product/")) return text;
  if (/^\d+$/.test(text)) return `gid://shopify/Product/${text}`;
  return text;
}

function toNumber(value) {
  const n = Number.parseFloat(String(value ?? "0").replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function parseSalesRows(tableData) {
  const rows = tableData?.rows ?? [];
  const byId = new Map();
  const orderedIds = [];

  for (const row of rows) {
    const productId = normalizeProductGid(row?.product_id ?? row?.productId);
    if (!productId) continue;

    const orders = toNumber(row?.orders);
    const totalSales = toNumber(row?.total_sales ?? row?.totalSales);
    if (orders <= 0 && totalSales <= 0) continue;

    byId.set(productId, { orders, totalSales });
    orderedIds.push(productId);
  }

  return { byId, orderedIds, count: orderedIds.length };
}

export async function fetchAllActiveProducts(admin, maxCount) {
  if (!admin?.graphql || maxCount <= 0) return [];

  const products = [];
  let cursor = null;
  const filter = "status:ACTIVE published_status:published";

  while (products.length < maxCount) {
    const first = Math.min(50, maxCount - products.length);
    try {
      const response = await admin.graphql(
        `#graphql
        query PredictaCoreAllProducts($first: Int!, $after: String, $query: String!) {
          products(first: $first, after: $after, sortKey: PUBLISHED_AT, reverse: true, query: $query) {
            nodes { ${PRODUCT_FIELDS} }
            pageInfo { hasNextPage endCursor }
          }
        }`,
        { variables: { first, after: cursor, query: filter } },
      );
      const { data, errors } = await response.json();
      if (errors?.length) break;

      for (const node of data?.products?.nodes ?? []) {
        if (node?.id) products.push(node);
      }

      const pageInfo = data?.products?.pageInfo;
      if (!pageInfo?.hasNextPage) break;
      cursor = pageInfo.endCursor;
    } catch {
      break;
    }
  }

  return products;
}

export async function fetchSalesRanking(admin) {
  if (!admin?.graphql) return null;

  try {
    const response = await admin.graphql(
      `#graphql
      query PredictaCoreSalesRanking($query: String!) {
        shopifyqlQuery(query: $query) {
          tableData {
            columns { name }
            rows
          }
          parseErrors
        }
      }`,
      { variables: { query: SHOPIFYQL_SALES } },
    );

    const { data, errors } = await response.json();
    if (errors?.length) return null;

    const payload = data?.shopifyqlQuery;
    if (payload?.parseErrors?.length) return null;

    const parsed = parseSalesRows(payload?.tableData);
    return parsed.count > 0 ? parsed : null;
  } catch {
    return null;
  }
}

export async function fetchProductsByIds(admin, ids) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0 || !admin?.graphql) return [];

  const products = [];
  const chunkSize = 50;

  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize);
    try {
      const response = await admin.graphql(
        `#graphql
        query PredictaCoreProductsByIds($ids: [ID!]!) {
          nodes(ids: $ids) {
            ... on Product { ${PRODUCT_FIELDS} }
          }
        }`,
        { variables: { ids: chunk } },
      );
      const { data, errors } = await response.json();
      if (errors?.length) continue;
      for (const node of data?.nodes ?? []) {
        if (node?.id) products.push(node);
      }
    } catch {
      // Skip failed chunk — fallback ranking still works with partial data.
    }
  }

  return products;
}

export async function enrichCatalogWithSalesProducts(admin, rawData, salesRanking) {
  if (!salesRanking?.orderedIds?.length) return rawData;

  const existingIds = new Set();
  for (const product of rawData?.catalogPool?.nodes ?? []) {
    if (product?.id) existingIds.add(product.id);
  }
  for (const collection of rawData?.bestSellerCollections?.nodes ?? []) {
    for (const product of collection?.products?.nodes ?? []) {
      if (product?.id) existingIds.add(product.id);
    }
  }

  const missingIds = salesRanking.orderedIds.filter((id) => !existingIds.has(id));
  if (missingIds.length === 0) return rawData;

  const extraProducts = await fetchProductsByIds(admin, missingIds);
  if (extraProducts.length === 0) return rawData;

  return {
    ...rawData,
    catalogPool: {
      nodes: [...(rawData.catalogPool?.nodes ?? []), ...extraProducts],
    },
  };
}
