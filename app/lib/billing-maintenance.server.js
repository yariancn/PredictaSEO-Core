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

/**
 * After $35 setup, register $15/mo with a 30-day deferral (month 1 covered by setup).
 * Best-effort — never blocks the merchant wizard.
 */
export async function ensureDeferredMaintenanceSubscription(admin, shop, { isTest = false } = {}) {
  const billing = await prisma.shopBilling.findUnique({ where: { shop } });
  if (!billing?.setupPaid) return { shop, skipped: true, reason: "setup_unpaid" };

  try {
    const response = await admin.graphql(ACTIVE_SUBS_QUERY);
    const { data, errors } = await response.json();
    if (errors?.length) return { shop, skipped: true, reason: "graphql_error" };

    const subs = data?.currentAppInstallation?.activeSubscriptions ?? [];
    if (hasActiveMaintenanceSubscription(subs)) {
      return { shop, skipped: true, reason: "already_active" };
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
      confirmationUrl: payload?.confirmationUrl ?? null,
      status: payload?.appSubscription?.status ?? null,
    };
  } catch (err) {
    console.warn("[PredictaCore] ensureDeferredMaintenanceSubscription:", err.message ?? err);
    return { shop, skipped: true, reason: "exception" };
  }
}
