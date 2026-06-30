import { MAINTENANCE_PLAN } from "../shopify.server.js";
import { getBillingReturnUrls } from "./billing-flow.server.js";
import prisma from "../db.server.js";

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

const SUBSCRIPTION_CREATE = `#graphql
  mutation appSubscriptionCreate(
    $name: String!
    $returnUrl: URL!
    $trialDays: Int!
    $test: Boolean
    $lineItems: [AppSubscriptionLineItemInput!]!
  ) {
    appSubscriptionCreate(
      name: $name
      returnUrl: $returnUrl
      trialDays: $trialDays
      test: $test
      lineItems: $lineItems
    ) {
      appSubscription {
        id
        status
      }
      confirmationUrl
      userErrors {
        field
        message
      }
    }
  }
`;

function hasActiveMaintenanceSubscription(subs = []) {
  return subs.some((s) => {
    const status = String(s.status ?? "").toUpperCase();
    return (status === "ACTIVE" || status === "ACCEPTED") && /predictacore|maint/i.test(String(s.name ?? ""));
  });
}

export async function getMaintenanceSubscriptionStatus(admin) {
  const response = await admin.graphql(ACTIVE_SUBS_QUERY);
  const { data, errors } = await response.json();
  if (errors?.length) {
    return { active: false, subs: [], error: errors.map((e) => e.message).join("; ") };
  }
  const subs = data?.currentAppInstallation?.activeSubscriptions ?? [];
  return { active: hasActiveMaintenanceSubscription(subs), subs };
}

/** Create $15/mo subscription (30-day trial — month 1 covered by $35 setup). */
export async function createMaintenanceSubscription(admin, shop, { isTest = false } = {}) {
  try {
    const status = await getMaintenanceSubscriptionStatus(admin);
    if (status.active) {
      return { shop, skipped: true, reason: "already_active", active: true };
    }

    const urls = getBillingReturnUrls(shop);
    const createResponse = await admin.graphql(SUBSCRIPTION_CREATE, {
      variables: {
        name: MAINTENANCE_PLAN,
        returnUrl: urls.adminReady,
        trialDays: 30,
        test: isTest || undefined,
        lineItems: [
          {
            plan: {
              appRecurringPricingDetails: {
                price: { amount: 15, currencyCode: "USD" },
                interval: "EVERY_30_DAYS",
              },
            },
          },
        ],
      },
    });
    const createJson = await createResponse.json();
    const payload = createJson?.data?.appSubscriptionCreate;
    if (payload?.userErrors?.length) {
      console.warn("[PredictaCore] maintenance sub create:", payload.userErrors);
      return { shop, skipped: true, reason: "user_errors" };
    }

    return {
      shop,
      created: true,
      active: false,
      needsApproval: Boolean(payload?.confirmationUrl),
      confirmationUrl: payload?.confirmationUrl ?? null,
      status: payload?.appSubscription?.status ?? null,
    };
  } catch (err) {
    console.warn("[PredictaCore] createMaintenanceSubscription:", err.message ?? err);
    return { shop, skipped: true, reason: "exception" };
  }
}

/** @deprecated Use createMaintenanceSubscription via unified billing chain. */
export async function ensureDeferredMaintenanceSubscription(admin, shop, opts = {}) {
  const billing = await prisma.shopBilling.findUnique({ where: { shop } });
  if (!billing?.setupPaid) return { shop, skipped: true, reason: "setup_unpaid" };
  return createMaintenanceSubscription(admin, shop, opts);
}
