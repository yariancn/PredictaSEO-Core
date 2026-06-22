import { isBillingTest } from "./billing.server.js";
import prisma from "../db.server.js";
import {
  EXTRA_PRODUCT_PACK_KIND,
  EXTRA_PRODUCT_PACK_PRICE,
  EXTRA_PRODUCT_PACK_SIZE,
  grantExtraProductPack,
} from "./product-limits.server.js";

const PURCHASE_CREATE = `#graphql
  mutation PredictaCoreExtraProductPack($name: String!, $returnUrl: URL!, $test: Boolean) {
    appPurchaseOneTimeCreate(
      name: $name
      returnUrl: $returnUrl
      price: { amount: ${EXTRA_PRODUCT_PACK_PRICE}.0, currencyCode: USD }
      test: $test
    ) {
      confirmationUrl
      appPurchaseOneTime { id status }
      userErrors { field message }
    }
  }
`;

const PURCHASE_STATUS = `#graphql
  query PredictaCoreExtraProductPackStatus($id: ID!) {
    node(id: $id) {
      ... on AppPurchaseOneTime {
        id
        status
        name
      }
    }
  }
`;

export async function requestExtraProductPackPurchase(admin, shop, returnUrl) {
  const name = `PredictaCore +${EXTRA_PRODUCT_PACK_SIZE} products`;
  const response = await admin.graphql(PURCHASE_CREATE, {
    variables: {
      name,
      returnUrl,
      test: isBillingTest(),
    },
  });
  const { data, errors } = await response.json();
  if (errors?.length) throw new Error(errors.map((e) => e.message).join("; "));

  const payload = data?.appPurchaseOneTimeCreate;
  const userErrors = payload?.userErrors ?? [];
  if (userErrors.length) throw new Error(userErrors.map((e) => e.message).join("; "));

  const confirmationUrl = payload?.confirmationUrl;
  const purchaseId = payload?.appPurchaseOneTime?.id;
  if (!confirmationUrl) throw new Error("Could not start product pack payment");

  return { confirmationUrl, purchaseId, shop };
}

export async function confirmExtraProductPackPurchase(admin, shop, chargeGid) {
  if (!chargeGid) return { granted: false, reason: "missing_charge" };

  const id = chargeGid.startsWith("gid://") ? chargeGid : `gid://shopify/AppPurchaseOneTime/${chargeGid}`;

  const existing = await prisma.processedBillingCharge.findUnique({ where: { id } });
  if (existing) {
    const tier = await import("./product-limits.server.js").then((m) => m.getShopProductTier(shop));
    return { granted: true, alreadyProcessed: true, tier };
  }

  const response = await admin.graphql(PURCHASE_STATUS, { variables: { id } });
  const { data, errors } = await response.json();
  if (errors?.length) throw new Error(errors.map((e) => e.message).join("; "));

  const purchase = data?.node;
  if (!purchase) return { granted: false, reason: "not_found" };

  const status = String(purchase.status ?? "").toUpperCase();
  if (status !== "ACTIVE" && status !== "ACCEPTED") {
    return { granted: false, reason: "not_paid", status };
  }

  await prisma.processedBillingCharge.create({
    data: { id: purchase.id, shop, kind: EXTRA_PRODUCT_PACK_KIND },
  });

  const tier = await grantExtraProductPack(shop, 1);
  return { granted: true, tier, packSize: EXTRA_PRODUCT_PACK_SIZE };
}
