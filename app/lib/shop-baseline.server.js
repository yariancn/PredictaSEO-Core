import prisma from "../db.server.js";

/** Immutable first-scan snapshot — never deleted by Restore all. Used for pilot/demo reset. */
export const BASELINE_BATCH = "__baseline__";

const PRODUCT_UPDATE = `#graphql
  mutation PredictaCoreBaselineProductUpdate($input: ProductInput!) {
    productUpdate(input: $input) {
      product { id }
      userErrors { field message }
    }
  }
`;

export async function hasShopBaseline(shop) {
  const count = await prisma.optimizationSnapshot.count({
    where: { shop, batchId: BASELINE_BATCH },
  });
  return count > 0;
}

/**
 * Save priority product SEO as it was on first audit (once per shop).
 * Lets pilot reset return to pre-PredictaCore state even after Restore all consumed apply backups.
 */
export async function ensureShopBaseline(shop, products = [], schemaOriginal = null, shopId = null) {
  if (!shop || products.length === 0) return { created: false, reason: "no_products" };

  const existing = await prisma.optimizationSnapshot.count({
    where: { shop, batchId: BASELINE_BATCH },
  });
  if (existing > 0) return { created: false, reason: "exists", count: existing };

  const applyRunCount = await prisma.applyRun.count({ where: { shop } });
  const applySnapshotCount = await prisma.optimizationSnapshot.count({
    where: { shop, batchId: { not: BASELINE_BATCH } },
  });
  if (applyRunCount > 0 || applySnapshotCount > 0) {
    return { created: false, reason: "after_apply" };
  }

  const appliedAt = new Date();
  let rows = 0;

  for (const product of products) {
    const seoTitle = product.seo?.title?.trim() ?? "";
    const seoDescription = product.seo?.description?.trim() ?? "";
    const descriptionHtml = product.descriptionHtml ?? product.description ?? "";

    for (const [field, originalValue] of [
      ["seo.title", seoTitle],
      ["seo.description", seoDescription],
      ["descriptionHtml", descriptionHtml],
    ]) {
      await prisma.optimizationSnapshot.create({
        data: {
          batchId: BASELINE_BATCH,
          shop,
          resourceType: "product",
          resourceId: product.id,
          field,
          originalValue,
          optimizedValue: null,
          appliedAt,
        },
      });
      rows += 1;
    }
  }

  if (shopId) {
    await prisma.optimizationSnapshot.create({
      data: {
        batchId: BASELINE_BATCH,
        shop,
        resourceType: "shop",
        resourceId: shopId,
        field: "metafield.predictacore.organization_json_ld",
        originalValue: schemaOriginal ?? "",
        optimizedValue: null,
        appliedAt,
      },
    });
    rows += 1;
  }

  return { created: true, count: rows, productCount: products.length };
}

export async function getBackupSummary(shop) {
  const rows = await prisma.optimizationSnapshot.findMany({
    where: { shop },
    select: { batchId: true, resourceType: true, resourceId: true },
  });

  const applyRows = rows.filter((r) => r.batchId !== BASELINE_BATCH);
  const baselineRows = rows.filter((r) => r.batchId === BASELINE_BATCH);

  const applyProductIds = new Set(
    applyRows.filter((r) => r.resourceType === "product").map((r) => r.resourceId),
  );
  const baselineProductIds = new Set(
    baselineRows.filter((r) => r.resourceType === "product").map((r) => r.resourceId),
  );
  const applyBatchIds = new Set(applyRows.map((r) => r.batchId).filter(Boolean));
  const hasSchemaBackup =
    applyRows.some((r) => r.resourceType === "shop" || r.resourceType === "theme") ||
    baselineRows.some((r) => r.resourceType === "shop" || r.resourceType === "theme");

  return {
    hasActiveBackup: applyRows.length > 0,
    hasBaseline: baselineRows.length > 0,
    applyProductCount: applyProductIds.size,
    baselineProductCount: baselineProductIds.size,
    applyBatchCount: applyBatchIds.size,
    hasSchemaBackup,
  };
}

export async function restoreProductsFromSnapshots(admin, snapshots) {
  const byProduct = new Map();
  for (const snap of snapshots) {
    if (snap.resourceType !== "product") continue;
    if (!byProduct.has(snap.resourceId)) byProduct.set(snap.resourceId, {});
    byProduct.get(snap.resourceId)[snap.field] = snap.originalValue ?? "";
  }

  let productsRestored = 0;
  const errors = [];

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
      const { data, errors: gqlErrors } = await response.json();
      if (gqlErrors?.length) throw new Error(gqlErrors.map((e) => e.message).join("; "));
      const userErrors = data?.productUpdate?.userErrors ?? [];
      if (userErrors.length) throw new Error(userErrors.map((e) => e.message).join("; "));
      productsRestored += 1;
    } catch (err) {
      errors.push(err.message ?? "Restore failed");
    }
  }

  if (errors.length) throw new Error(errors.join("; "));
  return { productsRestored, productCount: byProduct.size };
}

export async function restoreShopFromBaseline(admin, shop, rollbackSchemaFromTheme) {
  const snapshots = await prisma.optimizationSnapshot.findMany({
    where: { shop, batchId: BASELINE_BATCH },
    orderBy: { createdAt: "asc" },
  });
  if (!snapshots.length) {
    return { restored: false, reason: "no_baseline", productCount: 0, schemaRestored: false };
  }

  const schemaSnaps = snapshots.filter((s) => s.resourceType === "shop" || s.resourceType === "theme");
  const productSnaps = snapshots.filter((s) => s.resourceType === "product");

  if (schemaSnaps.length && rollbackSchemaFromTheme) {
    await rollbackSchemaFromTheme(admin, shop, schemaSnaps);
  }

  const productOutcome = productSnaps.length
    ? await restoreProductsFromSnapshots(admin, productSnaps)
    : { productsRestored: 0, productCount: 0 };

  return {
    restored: true,
    reason: "baseline",
    productCount: productOutcome.productsRestored,
    baselineProductCount: productOutcome.productCount,
    schemaRestored: schemaSnaps.length > 0,
    snapshotCount: snapshots.length,
  };
}
