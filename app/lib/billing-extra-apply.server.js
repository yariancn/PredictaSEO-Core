import { isBillingTest } from "./billing.server.js";
import { currentApplyPeriod, grantExtraApplyCredit } from "./apply-quota.server.js";

const EXTRA_APPLY_AMOUNT = 15;
const EXTRA_APPLY_CURRENCY = "USD";

const PURCHASE_CREATE = `#graphql
  mutation PredictaCoreExtraApplyPurchase($name: String!, $returnUrl: URL!, $test: Boolean) {
    appPurchaseOneTimeCreate(
      name: $name
      returnUrl: $returnUrl
      price: { amount: 15.0, currencyCode: USD }
      test: $test
    ) {
      confirmationUrl
      appPurchaseOneTime { id status }
      userErrors { field message }
    }
  }
`;

const PURCHASE_STATUS = `#graphql
  query PredictaCoreExtraApplyStatus($id: ID!) {
    node(id: $id) {
      ... on AppPurchaseOneTime {
        id
        status
        name
      }
    }
  }
`;

export async function requestExtraApplyPurchase(admin, shop, returnUrl) {
  const name = `PredictaCore extra apply — ${currentApplyPeriod()}`;
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
  if (!confirmationUrl) throw new Error("Could not start extra apply payment");

  return { confirmationUrl, purchaseId, shop };
}

export async function confirmExtraApplyPurchase(admin, shop, chargeGid) {
  if (!chargeGid) return { granted: false, reason: "missing_charge" };

  const id = chargeGid.startsWith("gid://") ? chargeGid : `gid://shopify/AppPurchaseOneTime/${chargeGid}`;

  const response = await admin.graphql(PURCHASE_STATUS, { variables: { id } });
  const { data, errors } = await response.json();
  if (errors?.length) throw new Error(errors.map((e) => e.message).join("; "));

  const purchase = data?.node;
  if (!purchase) return { granted: false, reason: "not_found" };

  const status = String(purchase.status ?? "").toUpperCase();
  if (status !== "ACTIVE" && status !== "ACCEPTED") {
    return { granted: false, reason: "not_paid", status };
  }

  const granted = await grantExtraApplyCredit(shop, purchase.id);
  return { granted, purchaseId: purchase.id, status };
}

export { EXTRA_APPLY_AMOUNT, EXTRA_APPLY_CURRENCY };
