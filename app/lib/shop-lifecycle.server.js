import prisma from "../db.server.js";
import { unauthenticated } from "../shopify.server";
import { rollbackAllBatches } from "./apply.server.js";

export const UNINSTALL_PREF = {
  RESTORE: "restore",
  KEEP: "keep",
};

export async function getUninstallRestorePreference(shop) {
  const settings = await prisma.shopSettings.findUnique({
    where: { shop },
    select: { uninstallRestorePreference: true },
  });
  const pref = settings?.uninstallRestorePreference;
  return pref === UNINSTALL_PREF.KEEP ? UNINSTALL_PREF.KEEP : UNINSTALL_PREF.RESTORE;
}

export async function setUninstallRestorePreference(shop, preference) {
  if (preference !== UNINSTALL_PREF.RESTORE && preference !== UNINSTALL_PREF.KEEP) {
    throw new Error("Invalid uninstall preference");
  }
  return prisma.shopSettings.upsert({
    where: { shop },
    create: { shop, uninstallRestorePreference: preference },
    update: { uninstallRestorePreference: preference },
  });
}

export async function shouldRestoreOnOffboarding(shop) {
  return (await getUninstallRestorePreference(shop)) === UNINSTALL_PREF.RESTORE;
}

function normalizeProductGid(id) {
  if (!id) return null;
  const raw = String(id);
  if (raw.startsWith("gid://")) return raw;
  return `gid://shopify/Product/${raw}`;
}

export async function shopHasRestoreBackups(shop) {
  const count = await prisma.optimizationSnapshot.count({ where: { shop } });
  return count > 0;
}

/**
 * Best-effort restore to pre-Apply originals. Requires a valid offline session + Shopify API access.
 * On uninstall Shopify often revokes the token before/during the webhook — we still try first.
 */
export async function attemptAutomaticRestore(shop, trigger = "unknown") {
  if (!(await shopHasRestoreBackups(shop))) {
    return {
      shop,
      trigger,
      attempted: false,
      restored: false,
      reason: "no_backups",
    };
  }

  try {
    const { admin } = await unauthenticated.admin(shop);
    const result = await rollbackAllBatches(admin, shop);
    return {
      shop,
      trigger,
      attempted: true,
      restored: true,
      productCount: result.productCount ?? 0,
      productsSkipped: result.productsSkipped ?? 0,
      schemaRestored: Boolean(result.schemaRestored),
      batches: result.batches ?? 0,
    };
  } catch (err) {
    console.warn(`[PredictaCore] Automatic restore failed (${trigger}) for ${shop}:`, err.message ?? err);
    return {
      shop,
      trigger,
      attempted: true,
      restored: false,
      reason: "api_failed",
      error: err.message ?? "Restore failed",
    };
  }
}

export function shopPayloadLooksInactive(payload = {}) {
  const plan = String(payload.plan_name ?? payload.plan_display_name ?? payload.plan ?? "").toLowerCase();
  if (/frozen|cancelled|canceled|dormant|closed|paused|fraud/.test(plan)) return true;
  if (payload.enabled === false || payload.active === false) return true;
  return false;
}

export async function syncSubscriptionFromWebhook(shop, payload = {}) {
  const sub = payload.app_subscription ?? payload;
  const status = String(sub.status ?? "").toUpperCase();
  if (!status) return { shop, updated: false, reason: "no_status" };

  const subscriptionActive = status === "ACTIVE" || status === "ACCEPTED";

  const existing = await prisma.shopBilling.findUnique({ where: { shop } });
  if (!existing) {
    return { shop, updated: false, reason: "no_billing_record" };
  }

  await prisma.shopBilling.update({
    where: { shop },
    data: { subscriptionActive },
  });

  return { shop, updated: true, subscriptionActive, status };
}

const ACTIVE_SUBS_QUERY = `#graphql
  query PredictaCoreActiveSubscriptions {
    currentAppInstallation {
      activeSubscriptions {
        name
        status
      }
    }
  }
`;

/** Live subscription check before cron apply — catches cancellations without opening the app. */
export async function syncSubscriptionFromAdmin(admin, shop) {
  try {
    const response = await admin.graphql(ACTIVE_SUBS_QUERY);
    const { data, errors } = await response.json();
    if (errors?.length) return { shop, synced: false, reason: "graphql_error" };

    const subs = data?.currentAppInstallation?.activeSubscriptions ?? [];
    const maintenanceActive = subs.some((s) => {
      const status = String(s.status ?? "").toUpperCase();
      return (status === "ACTIVE" || status === "ACCEPTED") && /maint/i.test(String(s.name ?? ""));
    });

    await prisma.shopBilling.upsert({
      where: { shop },
      create: { shop, subscriptionActive: maintenanceActive, setupPaid: false },
      update: { subscriptionActive: maintenanceActive },
    });

    return { shop, synced: true, subscriptionActive: maintenanceActive };
  } catch {
    return { shop, synced: false, reason: "api_failed" };
  }
}

export async function handleProductDeletedWebhook(shop, productId) {
  const resourceId = normalizeProductGid(productId);
  if (!resourceId) return { shop, deleted: 0 };

  const { count } = await prisma.optimizationSnapshot.deleteMany({
    where: { shop, resourceType: "product", resourceId },
  });

  return { shop, productId: resourceId, deleted: count };
}

/** Uninstall / shop closure: optional restore (merchant choice), then purge our DB. */
export async function handleShopOffboarding(shop, trigger) {
  const preference = await getUninstallRestorePreference(shop);
  let restore = {
    shop,
    trigger,
    attempted: false,
    restored: false,
    reason: "merchant_chose_keep",
    preference,
  };

  if (preference === UNINSTALL_PREF.RESTORE) {
    restore = { ...await attemptAutomaticRestore(shop, trigger), preference };
  }

  const purged = await (await import("./shop-data.server.js")).purgeShopData(shop);
  return { preference, restore, purged };
}
