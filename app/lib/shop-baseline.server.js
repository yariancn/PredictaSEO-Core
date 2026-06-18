import prisma from "../db.server.js";

/** Immutable original state — NEVER deleted by Restore. Required for merchant-safe rollback. */
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

async function writeBaselineRows(shop, products, schemaOriginal, websiteOriginal, shopId) {
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
    await prisma.optimizationSnapshot.create({
      data: {
        batchId: BASELINE_BATCH,
        shop,
        resourceType: "shop",
        resourceId: shopId,
        field: "metafield.predictacore.website_json_ld",
        originalValue: websiteOriginal ?? "",
        optimizedValue: null,
        appliedAt,
      },
    });
    rows += 2;
  }

  return { count: rows, productCount: products.length };
}

/**
 * Capture the store exactly as it was before PredictaCore's first Apply.
 * Called on first audit (pre-apply) and again immediately before Apply if still missing.
 */
export async function captureBaselineFromCatalog(admin, shop, products = [], shopId = null) {
  if (!shop || products.length === 0) return { created: false, reason: "no_products" };
  if (await hasShopBaseline(shop)) return { created: false, reason: "exists" };

  let schemaOriginal = "";
  let websiteOriginal = "";
  if (admin) {
    try {
      const { readOrganizationSchemaMetafield, readWebsiteJsonLdMetafield } = await import("./schema.server.js");
      schemaOriginal = await readOrganizationSchemaMetafield(admin);
      websiteOriginal = await readWebsiteJsonLdMetafield(admin);
    } catch {
      schemaOriginal = "";
      websiteOriginal = "";
    }
  }

  const written = await writeBaselineRows(shop, products, schemaOriginal, websiteOriginal, shopId);
  return { created: true, ...written };
}

/** @deprecated use captureBaselineFromCatalog */
export async function ensureShopBaseline(shop, products = [], schemaOriginal = null, shopId = null) {
  if (await hasShopBaseline(shop)) return { created: false, reason: "exists" };
  const written = await writeBaselineRows(shop, products, schemaOriginal ?? "", "", shopId);
  return { created: true, ...written };
}

export async function captureBaselineBeforeApply(admin, shop, products, shopRecord) {
  return captureBaselineFromCatalog(admin, shop, products, shopRecord?.id ?? null);
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

  const applyRunCount = await prisma.applyRun.count({ where: { shop } });

  return {
    hasActiveBackup: applyRows.length > 0,
    hasBaseline: baselineRows.length > 0,
    baselineMissing: applyRunCount > 0 && baselineRows.length === 0,
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

async function restoreWebsiteFromBaseline(admin, snapshots) {
  const websiteSnap = snapshots.find((s) => s.field?.includes("website_json_ld"));
  if (!websiteSnap) return false;

  const { restoreWebsiteJsonLdFromValue } = await import("./schema.server.js");
  await restoreWebsiteJsonLdFromValue(admin, websiteSnap.originalValue ?? "");
  return true;
}

export async function restoreShopFromBaseline(admin, shop, rollbackSchemaFromTheme) {
  const snapshots = await prisma.optimizationSnapshot.findMany({
    where: { shop, batchId: BASELINE_BATCH },
    orderBy: { createdAt: "asc" },
  });
  if (!snapshots.length) {
    return { restored: false, reason: "no_baseline", productCount: 0, schemaRestored: false };
  }

  const schemaSnaps = snapshots.filter(
    (s) =>
      s.resourceType === "shop" &&
      (s.field?.includes("organization_json_ld") || s.field?.includes("theme")),
  );
  const productSnaps = snapshots.filter((s) => s.resourceType === "product");
  const productIds = [...new Set(productSnaps.map((s) => s.resourceId))];

  if (schemaSnaps.length && rollbackSchemaFromTheme) {
    await rollbackSchemaFromTheme(admin, shop, schemaSnaps);
  }
  await restoreWebsiteFromBaseline(admin, snapshots);

  const { deleteProductJsonLd } = await import("./product-schema.server.js");
  for (const productId of productIds) {
    await deleteProductJsonLd(admin, productId).catch(() => {});
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
    productIds,
  };
}

/**
 * Full restore for any merchant: revert Shopify to immutable baseline, then clear apply backups.
 * Falls back to apply-batch rollback only when baseline was never captured (legacy stores).
 */
export async function fullRestoreShopToOriginal(admin, shop, options = {}) {
  const { resetQuota = true, priorityProductsForStrip = [], allowPilotStrip = false } = options;
  const { rollbackSchemaFromTheme } = await import("./schema.server.js");
  const { resetApplyQuotaAfterRestore } = await import("./apply-quota.server.js");

  if (await hasShopBaseline(shop)) {
    const baselineResult = await restoreShopFromBaseline(admin, shop, rollbackSchemaFromTheme);

    await prisma.optimizationSnapshot.deleteMany({
      where: { shop, batchId: { not: BASELINE_BATCH } },
    });

    await prisma.entityProfile.updateMany({
      where: { shop },
      data: { schemaActive: false, schemaThemeId: null },
    });

    if (resetQuota) {
      await resetApplyQuotaAfterRestore(shop);
    }

    return {
      method: "baseline",
      baselineRestored: true,
      ...baselineResult,
      batches: 0,
    };
  }

  const { rollbackAllBatches, stripPriorityProductsForDemo } = await import("./apply.server.js");
  const applyRollback = await rollbackAllBatches(admin, shop);

  let stripped = 0;
  if (
    allowPilotStrip &&
    (applyRollback.snapshotCount ?? 0) === 0 &&
    applyRollback.batches === 0 &&
    priorityProductsForStrip.length > 0
  ) {
    const stripResult = await stripPriorityProductsForDemo(admin, priorityProductsForStrip);
    stripped = stripResult.stripped;
  }

  const { deactivateSchemaForShop } = await import("./schema.server.js");
  if (!applyRollback.schemaRestored) {
    await deactivateSchemaForShop(admin, shop).catch(() => {});
  }

  if (resetQuota) {
    await resetApplyQuotaAfterRestore(shop);
  }

  return {
    method: applyRollback.snapshotCount > 0 ? "apply_snapshots" : stripped > 0 ? "pilot_strip" : "none",
    baselineRestored: false,
    baselineReason: "no_baseline",
    strippedForDemo: stripped,
    ...applyRollback,
    productCount: Math.max(applyRollback.productCount ?? 0, stripped),
  };
}
