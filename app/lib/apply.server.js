import prisma from "../db.server.js";
import { describePreviewChanges } from "./preview.js";
import { inferProductCategory } from "./forense.server.js";
import { applySchemaToTheme, rollbackSchemaFromTheme, saveWebsiteJsonLd } from "./schema.server.js";
import {
  buildSeoForProduct,
  buildProductDescriptionHtml,
} from "./content-engine.server.js";
import { buildProductJsonLd, saveProductJsonLd } from "./product-schema.server.js";
import { detectGeoMismatch } from "./markets.server.js";
import { selectAiProductIds, TOP_AI_PRODUCTS } from "./product-limits.server.js";
import { saveLlmsTxtMetafield } from "./validation.server.js";
import { registerProductLocaleTranslations } from "./translations.server.js";

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

function needsGeoFix(product, marketContext) {
  const blob = `${product.seo?.title ?? ""} ${product.seo?.description ?? ""}`;
  return detectGeoMismatch(blob, marketContext?.countryCodes ?? []);
}

function needsSeoTitle(product, marketContext) {
  return (product.seo?.title ?? "").trim().length < 10 || needsGeoFix(product, marketContext);
}

function needsSeoDescription(product, marketContext) {
  return (product.seo?.description ?? "").trim().length < 50 || needsGeoFix(product, marketContext);
}

function needsBodyDescription(product) {
  return stripHtml(product.descriptionHtml ?? product.description).length < 40;
}

export async function buildPreviewPlan(products, shopName, matrix, options = {}) {
  const {
    jsonLd,
    schemaActive = false,
    marketContext,
    shop,
    salesRanking = null,
    aiPolishLimit = TOP_AI_PRODUCTS,
    skipAi = false,
  } = options;
  const geminiReady = !skipAi && Boolean(process.env.GEMINI_API_KEY?.trim());
  const aiIds = selectAiProductIds(matrix, salesRanking, aiPolishLimit);
  const items = [];
  const candidates = [];

  for (const product of products) {
    const category = inferProductCategory(product);
    const needsChange =
      needsSeoTitle(product, marketContext) ||
      needsSeoDescription(product, marketContext) ||
      needsBodyDescription(product);
    if (!needsChange) continue;
    candidates.push({
      product,
      category,
      useAi: !skipAi && aiIds.has(product.id) && geminiReady,
    });
  }

  const AI_BATCH = 3;
  for (let i = 0; i < candidates.length; i += AI_BATCH) {
    const batch = candidates.slice(i, i + AI_BATCH);
    const batchItems = await Promise.all(
      batch.map(async ({ product, category, useAi }) => {
        const proposed = await buildSeoForProduct(product, shopName, category, marketContext, { useAi });
        const changes = {};
        const before = {
          seoTitle: product.seo?.title?.trim() || "",
          seoDescription: product.seo?.description?.trim() || "",
          descriptionHtml: product.descriptionHtml ?? product.description ?? "",
        };
        const after = { ...before };

        if (needsSeoTitle(product, marketContext)) {
          changes.seoTitle = proposed.seoTitle;
          after.seoTitle = proposed.seoTitle;
        }
        if (needsSeoDescription(product, marketContext)) {
          changes.seoDescription = proposed.seoDescription;
          after.seoDescription = proposed.seoDescription;
        }
        if (needsBodyDescription(product)) {
          changes.descriptionHtml = buildProductDescriptionHtml(product, shopName, marketContext);
          after.descriptionHtml = changes.descriptionHtml;
        }

        if (Object.keys(changes).length === 0) return null;

        return {
          id: product.id,
          handle: product.handle,
          title: product.title,
          category,
          isMirror: useAi,
          aiGenerated: Boolean(proposed.aiGenerated),
          before: {
            seoTitle: before.seoTitle || "—",
            seoDescription: before.seoDescription || "—",
            hasDescription: !needsBodyDescription(product),
          },
          after,
          changes,
          originals: before,
          productSnapshot: product,
        };
      }),
    );
    items.push(...batchItems.filter(Boolean));
  }

  const schema = {
    willApply: !schemaActive && !!jsonLd,
    jsonLd: jsonLd ?? null,
    websiteWillApply: Boolean(shop && !schemaActive),
  };

  return {
    items,
    total: items.length + (schema.willApply ? 1 : 0),
    productCount: items.length,
    mirrorCount: items.filter((i) => i.isMirror).length,
    batchCount: new Set(items.map((i) => i.category)).size,
    schema,
    marketContext,
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

function isProductMissingError(message = "") {
  const lower = message.toLowerCase();
  return (
    lower.includes("not found") ||
    lower.includes("does not exist") ||
    lower.includes("could not find") ||
    lower.includes("invalid product")
  );
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
  const { jsonLd, shop: shopRecord, marketContext, priorityProducts = [], shopName = "" } = options;

  const { captureBaselineBeforeApply } = await import("./shop-baseline.server.js");
  if (priorityProducts.length > 0) {
    await captureBaselineBeforeApply(admin, shop, priorityProducts, shopRecord);
  }

  let applied = 0;
  let failedCount = 0;
  const errors = [];
  let schemaApplied = false;
  let schemaError = null;
  let productSchemasApplied = 0;

  const APPLY_UPDATE_BATCH = 5;
  const items = preview.items ?? [];

  for (let i = 0; i < items.length; i += APPLY_UPDATE_BATCH) {
    const batch = items.slice(i, i + APPLY_UPDATE_BATCH);
    await Promise.all(
      batch.map(async (item) => {
        try {
          await applyProductChange(admin, item);
          if (shopName && marketContext?.publishedLocales?.length > 1) {
            await registerProductLocaleTranslations(admin, item, shopName, marketContext).catch(() => {});
          }
          if (shopRecord && marketContext) {
            const productForSchema = {
              ...(item.productSnapshot ?? {}),
              id: item.id,
              handle: item.handle,
              title: item.title,
              seo: {
                title: item.after?.seoTitle ?? item.changes?.seoTitle,
                description: item.after?.seoDescription ?? item.changes?.seoDescription,
              },
              descriptionHtml: item.after?.descriptionHtml ?? item.changes?.descriptionHtml,
            };
            const productLd = buildProductJsonLd(productForSchema, shopRecord, marketContext);
            await saveProductJsonLd(admin, productForSchema, productLd);
            productSchemasApplied += 1;
          }
          await saveProductSnapshots(shop, batchId, item);
          applied += 1;
        } catch (err) {
          failedCount += 1;
          errors.push(`${item.title ?? item.id}: ${err.message ?? "Update failed"}`);
        }
      }),
    );
  }

  if (preview.schema?.willApply && jsonLd) {
    try {
      const schemaResult = await applySchemaToTheme(admin, shop, jsonLd);
      if (shopRecord) {
        await saveWebsiteJsonLd(admin, shopRecord).catch(() => {});
        await saveLlmsTxtMetafield(admin, shopRecord, marketContext).catch(() => {});
      }
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

  return {
    applied,
    failedCount,
    errors,
    partial: failedCount > 0,
    batchId,
    schemaApplied,
    schemaError,
    productSchemasApplied,
  };
}

async function rollbackProductSnapshots(admin, snapshots) {
  const byProduct = new Map();
  for (const snap of snapshots) {
    if (snap.resourceType !== "product") continue;
    if (!byProduct.has(snap.resourceId)) byProduct.set(snap.resourceId, {});
    byProduct.get(snap.resourceId)[snap.field] = snap.originalValue ?? "";
  }

  let productsRestored = 0;
  let productsSkipped = 0;
  const skipped = [];
  const failed = [];

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

    try {
      const response = await admin.graphql(PRODUCT_UPDATE, { variables: { input } });
      const { data, errors } = await response.json();
      if (errors?.length) {
        const msg = errors.map((e) => e.message).join("; ");
        if (isProductMissingError(msg)) {
          productsSkipped += 1;
          skipped.push(resourceId);
          continue;
        }
        throw new Error(msg);
      }
      const userErrors = data?.productUpdate?.userErrors ?? [];
      if (userErrors.length) {
        const msg = userErrors.map((e) => e.message).join("; ");
        if (isProductMissingError(msg)) {
          productsSkipped += 1;
          skipped.push(resourceId);
          continue;
        }
        throw new Error(msg);
      }
      productsRestored += 1;
    } catch (err) {
      const msg = err.message ?? "Restore failed";
      if (isProductMissingError(msg)) {
        productsSkipped += 1;
        skipped.push(resourceId);
        continue;
      }
      failed.push({ resourceId, error: msg });
    }
  }

  if (failed.length > 0) {
    throw new Error(failed.map((f) => f.error).join("; "));
  }

  return { productsRestored, productsSkipped, skippedProductIds: skipped };
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
  const productOutcome = await rollbackProductSnapshots(admin, productSnaps);
  await prisma.optimizationSnapshot.deleteMany({ where: { shop, batchId } });

  return {
    restored: snapshots.length,
    batchId,
    snapshotCount: summary.snapshotCount,
    productCount: productOutcome.productsRestored,
    productsSkipped: productOutcome.productsSkipped,
    schemaRestored: summary.schemaRestored,
  };
}

export async function rollbackLatestBatch(admin, shop) {
  const { BASELINE_BATCH } = await import("./shop-baseline.server.js");
  const latest = await prisma.optimizationSnapshot.findFirst({
    where: { shop, batchId: { not: BASELINE_BATCH } },
    orderBy: { appliedAt: "desc" },
    select: { batchId: true },
  });
  if (!latest?.batchId) {
    return { restored: 0, snapshotCount: 0, productCount: 0, schemaRestored: false };
  }
  return rollbackBatch(admin, shop, latest.batchId);
}

export async function rollbackAllBatches(admin, shop) {
  const { BASELINE_BATCH } = await import("./shop-baseline.server.js");
  const batches = await prisma.optimizationSnapshot.findMany({
    where: { shop, batchId: { not: BASELINE_BATCH } },
    distinct: ["batchId"],
    select: { batchId: true },
    orderBy: { appliedAt: "desc" },
  });
  let snapshotCount = 0;
  let productCount = 0;
  let productsSkipped = 0;
  let schemaRestored = false;
  for (const { batchId } of batches) {
    const result = await rollbackBatch(admin, shop, batchId);
    snapshotCount += result.snapshotCount ?? result.restored ?? 0;
    productCount += result.productCount ?? 0;
    productsSkipped += result.productsSkipped ?? 0;
    schemaRestored = schemaRestored || Boolean(result.schemaRestored);
  }
  return {
    restored: snapshotCount,
    snapshotCount,
    productCount,
    productsSkipped,
    schemaRestored,
    batches: batches.length,
  };
}

export async function stripPriorityProductsForDemo(admin, products = []) {
  let stripped = 0;
  const errors = [];

  for (const product of products) {
    const title = (product.title ?? "Product").trim().slice(0, 70) || "Product";
    try {
      const response = await admin.graphql(PRODUCT_UPDATE, {
        variables: {
          input: {
            id: product.id,
            seo: { title, description: "" },
            descriptionHtml: "",
          },
        },
      });
      const { data, errors: gqlErrors } = await response.json();
      if (gqlErrors?.length) throw new Error(gqlErrors.map((e) => e.message).join("; "));
      const userErrors = data?.productUpdate?.userErrors ?? [];
      if (userErrors.length) throw new Error(userErrors.map((e) => e.message).join("; "));
      stripped += 1;
    } catch (err) {
      errors.push(`${product.title ?? product.id}: ${err.message ?? "Strip failed"}`);
    }
  }

  if (errors.length && stripped === 0) {
    throw new Error(errors.join("; "));
  }

  return { stripped, errors };
}

/**
 * Pilot / test-store reset: undo apply backups, restore first-scan baseline, or strip SEO for demo.
 */
export async function resetTestStoreForDemo(admin, shop, options = {}) {
  const { priorityProducts = [] } = options;
  const { fullRestoreShopToOriginal } = await import("./shop-baseline.server.js");

  const result = await fullRestoreShopToOriginal(admin, shop, {
    resetQuota: true,
    priorityProductsForStrip: priorityProducts,
    allowPilotStrip: true,
  });

  await prisma.shopSettings.updateMany({
    where: { shop },
    data: { marketsConfirmed: false },
  });

  return result;
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
  const { BASELINE_BATCH } = await import("./shop-baseline.server.js");
  const rows = await prisma.optimizationSnapshot.findMany({
    where: { shop, resourceType: "product", batchId: { not: BASELINE_BATCH } },
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
