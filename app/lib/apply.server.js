import prisma from "../db.server.js";
import { inferProductCategory } from "./forense.server.js";
import { applySchemaToTheme, rollbackSchemaFromTheme, deactivateSchemaForShop } from "./schema.server.js";

const PRODUCT_UPDATE = `#graphql
  mutation PredictaCoreProductUpdate($input: ProductInput!) {
    productUpdate(input: $input) {
      product { id title }
      userErrors { field message }
    }
  }
`;

const METAFIELD_NAMESPACE = "predictacore";
const METAFIELD_KEY = "organization_json_ld";

function stripHtml(html) {
  return (html ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function renderPattern(pattern, vars) {
  return pattern.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? "");
}

function buildSeoProposal(product, shopName, categoryName) {
  const vars = {
    product_title: product.title,
    category: categoryName,
    category_lower: categoryName.toLowerCase(),
    shop_name: shopName,
  };
  const titlePattern = "{product_title} | Premium {category} — US & Canada";
  const descPattern =
    "Shop {product_title} at {shop_name}. Premium {category_lower} for US & Canada riders. Fast shipping.";
  return {
    seoTitle: renderPattern(titlePattern, vars).slice(0, 70),
    seoDescription: renderPattern(descPattern, vars).slice(0, 160),
  };
}

function buildProductDescriptionHtml(product, shopName) {
  const title = product.title?.trim() || "Product";
  const vendor = product.vendor?.trim();
  const type = product.productType?.trim();
  const tags = (product.tags ?? []).slice(0, 5).join(", ");
  const intro = vendor
    ? `${title} from ${vendor}${type ? ` — ${type}` : ""}.`
    : `${title}${type ? ` — ${type}` : ""}.`;

  const bullets = [];
  if (type) bullets.push(`Category: ${type}`);
  if (tags) bullets.push(`Tags: ${tags}`);
  bullets.push(`Available at ${shopName}`);

  const body = stripHtml(product.descriptionHtml ?? product.description);
  const existing = body.length > 40 ? `<p>${body.slice(0, 500)}</p>` : "";

  return `<p>${intro}</p>
${existing}
<ul>${bullets.map((b) => `<li>${b}</li>`).join("")}</ul>
<p>Shop with confidence at ${shopName}.</p>`;
}

function needsSeoTitle(product) {
  return (product.seo?.title ?? "").trim().length < 10;
}

function needsSeoDescription(product) {
  return (product.seo?.description ?? "").trim().length < 50;
}

function needsBodyDescription(product) {
  return stripHtml(product.descriptionHtml ?? product.description).length < 40;
}

export function buildPreviewPlan(products, shopName, matrix, options = {}) {
  const { jsonLd, schemaActive = false } = options;
  const mirrorIds = new Set(
    matrix.filter((r) => r.viability === "ALTA").slice(0, 3).map((r) => r.product.id),
  );
  const items = [];

  for (const product of products) {
    const category = inferProductCategory(product);
    const isMirror = mirrorIds.has(product.id);
    const proposed = buildSeoProposal(product, shopName, category);
    const changes = {};
    const before = {
      seoTitle: product.seo?.title?.trim() || "",
      seoDescription: product.seo?.description?.trim() || "",
      descriptionHtml: product.descriptionHtml ?? product.description ?? "",
    };
    const after = { ...before };

    if (needsSeoTitle(product)) {
      changes.seoTitle = proposed.seoTitle;
      after.seoTitle = proposed.seoTitle;
    }
    if (needsSeoDescription(product)) {
      changes.seoDescription = proposed.seoDescription;
      after.seoDescription = proposed.seoDescription;
    }
    if (needsBodyDescription(product)) {
      changes.descriptionHtml = buildProductDescriptionHtml(product, shopName);
      after.descriptionHtml = changes.descriptionHtml;
    }

    if (Object.keys(changes).length === 0) continue;

    items.push({
      id: product.id,
      title: product.title,
      category,
      isMirror,
      before: {
        seoTitle: before.seoTitle || "—",
        seoDescription: before.seoDescription || "—",
        hasDescription: !needsBodyDescription(product),
      },
      after,
      changes,
      originals: before,
    });
  }

  const schema = {
    willApply: !schemaActive && !!jsonLd,
    jsonLd: jsonLd ?? null,
  };

  return {
    items,
    total: items.length + (schema.willApply ? 1 : 0),
    productCount: items.length,
    mirrorCount: items.filter((i) => i.isMirror).length,
    batchCount: new Set(items.map((i) => i.category)).size,
    schema,
  };
}

function buildSeoMutationInput(item) {
  if (!item.changes.seoTitle && !item.changes.seoDescription) return null;

  const title = (
    item.changes.seoTitle ||
    item.after.seoTitle ||
    item.originals.seoTitle ||
    item.title ||
    ""
  ).trim();
  const description = (
    item.changes.seoDescription ||
    item.after.seoDescription ||
    item.originals.seoDescription ||
    ""
  ).trim();

  const seo = {};
  if (title) seo.title = title.slice(0, 70);
  if (description) seo.description = description.slice(0, 160);
  return Object.keys(seo).length ? seo : null;
}

async function applyProductChange(admin, item) {
  const input = { id: item.id };
  const seo = buildSeoMutationInput(item);
  if (seo) input.seo = seo;
  if (item.changes.descriptionHtml) {
    input.descriptionHtml = item.changes.descriptionHtml;
  }

  const response = await admin.graphql(PRODUCT_UPDATE, { variables: { input } });
  const { data, errors } = await response.json();
  if (errors?.length) throw new Error(errors.map((e) => e.message).join("; "));
  const userErrors = data?.productUpdate?.userErrors ?? [];
  if (userErrors.length) throw new Error(userErrors.map((e) => e.message).join("; "));
}

async function saveProductSnapshots(shop, batchId, item) {
  const originals = item.originals ?? item.before;

  if (item.changes.seoTitle) {
    await prisma.optimizationSnapshot.create({
      data: {
        batchId,
        shop,
        resourceType: "product",
        resourceId: item.id,
        field: "seo.title",
        originalValue: originals.seoTitle ?? "",
        optimizedValue: item.changes.seoTitle,
        appliedAt: new Date(),
      },
    });
  }
  if (item.changes.seoDescription) {
    await prisma.optimizationSnapshot.create({
      data: {
        batchId,
        shop,
        resourceType: "product",
        resourceId: item.id,
        field: "seo.description",
        originalValue: originals.seoDescription ?? "",
        optimizedValue: item.changes.seoDescription,
        appliedAt: new Date(),
      },
    });
  }
  if (item.changes.descriptionHtml) {
    await prisma.optimizationSnapshot.create({
      data: {
        batchId,
        shop,
        resourceType: "product",
        resourceId: item.id,
        field: "descriptionHtml",
        originalValue: originals.descriptionHtml ?? "",
        optimizedValue: item.changes.descriptionHtml,
        appliedAt: new Date(),
      },
    });
  }
}

export async function applyPreviewPlan(admin, shop, preview, batchId, options = {}) {
  const { jsonLd } = options;
  let applied = 0;
  let schemaApplied = false;
  let schemaError = null;

  for (const item of preview.items) {
    await applyProductChange(admin, item);
    await saveProductSnapshots(shop, batchId, item);
    applied += 1;
  }

  if (preview.schema?.willApply && jsonLd) {
    try {
      const schemaResult = await applySchemaToTheme(admin, shop, jsonLd);
      const { shopId, originals } = schemaResult;

      await prisma.optimizationSnapshot.create({
        data: {
          batchId,
          shop,
          resourceType: "shop",
          resourceId: shopId,
          field: `metafield.${METAFIELD_NAMESPACE}.${METAFIELD_KEY}`,
          originalValue: originals.metafield ?? "",
          optimizedValue: "predictacore-schema-metafield",
          appliedAt: new Date(),
        },
      });
      applied += 1;
      schemaApplied = true;
    } catch (err) {
      schemaError = err.message ?? "Brand identity could not be saved";
    }
  }

  return { applied, batchId, schemaApplied, schemaError };
}

async function rollbackProductSnapshots(admin, snapshots) {
  const byProduct = new Map();
  for (const snap of snapshots) {
    if (snap.resourceType !== "product") continue;
    if (!byProduct.has(snap.resourceId)) byProduct.set(snap.resourceId, {});
    byProduct.get(snap.resourceId)[snap.field] = snap.originalValue ?? "";
  }

  let productsRestored = 0;
  for (const [resourceId, fields] of byProduct) {
    const input = { id: resourceId };
    if ("seo.title" in fields || "seo.description" in fields) {
      input.seo = {
        title: fields["seo.title"] ?? "",
        description: fields["seo.description"] ?? "",
      };
    }
    if ("descriptionHtml" in fields) {
      input.descriptionHtml = fields["descriptionHtml"] ?? "";
    }

    const response = await admin.graphql(PRODUCT_UPDATE, { variables: { input } });
    const { data, errors } = await response.json();
    if (errors?.length) throw new Error(errors.map((e) => e.message).join("; "));
    const userErrors = data?.productUpdate?.userErrors ?? [];
    if (userErrors.length) throw new Error(userErrors.map((e) => e.message).join("; "));
    productsRestored += 1;
  }
  return productsRestored;
}

function summarizeRollback(snapshots) {
  const productIds = new Set(
    snapshots.filter((s) => s.resourceType === "product").map((s) => s.resourceId),
  );
  const schemaRestored = snapshots.some(
    (s) => s.resourceType === "shop" || s.resourceType === "theme",
  );
  return {
    snapshotCount: snapshots.length,
    productCount: productIds.size,
    schemaRestored,
  };
}

export async function rollbackBatch(admin, shop, batchId) {
  const snapshots = await prisma.optimizationSnapshot.findMany({
    where: { shop, batchId },
    orderBy: { createdAt: "desc" },
  });
  if (snapshots.length === 0) {
    return { restored: 0, batchId, snapshotCount: 0, productCount: 0, schemaRestored: false };
  }

  const schemaSnaps = snapshots.filter(
    (s) => s.resourceType === "theme" || s.resourceType === "shop",
  );
  const productSnaps = snapshots.filter((s) => s.resourceType === "product");
  const summary = summarizeRollback(snapshots);

  if (schemaSnaps.length) {
    await rollbackSchemaFromTheme(admin, shop, schemaSnaps);
  }
  const productsRestored = await rollbackProductSnapshots(admin, productSnaps);
  await prisma.optimizationSnapshot.deleteMany({ where: { shop, batchId } });

  return {
    restored: snapshots.length,
    batchId,
    snapshotCount: summary.snapshotCount,
    productCount: productsRestored,
    schemaRestored: summary.schemaRestored,
  };
}

export async function rollbackLatestBatch(admin, shop) {
  const latest = await prisma.optimizationSnapshot.findFirst({
    where: { shop },
    orderBy: { appliedAt: "desc" },
    select: { batchId: true },
  });
  if (!latest?.batchId) {
    return { restored: 0, snapshotCount: 0, productCount: 0, schemaRestored: false };
  }
  return rollbackBatch(admin, shop, latest.batchId);
}

export async function rollbackAllBatches(admin, shop) {
  const batches = await prisma.optimizationSnapshot.findMany({
    where: { shop },
    distinct: ["batchId"],
    select: { batchId: true },
    orderBy: { appliedAt: "desc" },
  });
  let snapshotCount = 0;
  let productCount = 0;
  let schemaRestored = false;
  for (const { batchId } of batches) {
    const result = await rollbackBatch(admin, shop, batchId);
    snapshotCount += result.snapshotCount ?? result.restored ?? 0;
    productCount += result.productCount ?? 0;
    schemaRestored = schemaRestored || Boolean(result.schemaRestored);
  }
  return {
    restored: snapshotCount,
    snapshotCount,
    productCount,
    schemaRestored,
    batches: batches.length,
  };
}

/** Pilot only — clears PredictaCore backups, brand identity, and SEO on priority products for a full demo rerun. */
export async function resetTestStoreForDemo(admin, shop, priorityProducts) {
  const rollback = await rollbackAllBatches(admin, shop);
  await deactivateSchemaForShop(admin, shop);

  let productsCleared = 0;
  for (const product of priorityProducts) {
    const response = await admin.graphql(PRODUCT_UPDATE, {
      variables: {
        input: {
          id: product.id,
          seo: { title: "", description: "" },
        },
      },
    });
    const { data, errors } = await response.json();
    if (errors?.length) throw new Error(errors.map((e) => e.message).join("; "));
    const userErrors = data?.productUpdate?.userErrors ?? [];
    if (userErrors.length) throw new Error(userErrors.map((e) => e.message).join("; "));
    productsCleared += 1;
  }

  return {
    ...rollback,
    productsCleared,
    schemaCleared: true,
  };
}

export function buildAppliedItemsFromPreview(items = []) {
  return items.map((item) => ({
    title: item.title,
    changes: describePreviewChanges(item),
  }));
}

const SNAPSHOT_FIELD_LABELS = {
  "seo.title": "changeSearchTitle",
  "seo.description": "changeSearchDesc",
  descriptionHtml: "changeProductDesc",
};

export async function getAppliedCatalogSummary(shop, products = [], tr = (key) => key) {
  const rows = await prisma.optimizationSnapshot.findMany({
    where: { shop, resourceType: "product" },
    orderBy: { createdAt: "desc" },
  });
  if (!rows.length) return [];

  const byProduct = new Map();
  for (const row of rows) {
    if (!byProduct.has(row.resourceId)) {
      byProduct.set(row.resourceId, new Set());
    }
    const labelKey = SNAPSHOT_FIELD_LABELS[row.field];
    if (labelKey) byProduct.get(row.resourceId).add(tr(labelKey));
  }

  const titleById = new Map(products.map((p) => [p.id, p.title]));
  return [...byProduct.entries()]
    .map(([id, changeSet]) => ({
      title: titleById.get(id) || id.split("/").pop() || id,
      changes: [...changeSet],
    }))
    .sort((a, b) => a.title.localeCompare(b.title));
}

export async function getOptimizationHistory(shop) {
  const rows = await prisma.optimizationSnapshot.findMany({
    where: { shop },
    orderBy: { createdAt: "desc" },
  });
  const byBatch = new Map();
  for (const row of rows) {
    if (!byBatch.has(row.batchId)) {
      byBatch.set(row.batchId, { batchId: row.batchId, count: 0, createdAt: row.createdAt });
    }
    byBatch.get(row.batchId).count += 1;
  }
  return [...byBatch.values()];
}
