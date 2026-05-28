import "@shopify/shopify-app-remix/adapters/node";
import {
  shopifyApp,
  AppDistribution,
  ApiVersion,
  BillingInterval,
} from "@shopify/shopify-app-remix/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma from "./db.server";
import { getShopifyApiKey, getShopifyAppUrl, getShopifyApiSecret, getShopifyScopes } from "./lib/env.server";

export const SETUP_PLAN = "SETUP";
export const MAINTENANCE_PLAN = "PredictaCore monthly";

const shopify = shopifyApp({
  apiKey: getShopifyApiKey(),
  apiSecretKey: getShopifyApiSecret(),
  apiVersion: ApiVersion.April26,
  scopes: getShopifyScopes(),
  appUrl: getShopifyAppUrl(),
  authPathPrefix: "/auth",
  sessionStorage: new PrismaSessionStorage(prisma),
  distribution: AppDistribution.AppStore,
  billing: {
    [SETUP_PLAN]: {
      amount: 35,
      currencyCode: "USD",
      interval: BillingInterval.OneTime,
    },
    [MAINTENANCE_PLAN]: {
      lineItems: [
        {
          amount: 15,
          currencyCode: "USD",
          interval: BillingInterval.Every30Days,
        },
      ],
    },
  },
  future: {
    unstable_newEmbeddedAuthStrategy: true,
    expiringOfflineAccessTokens: true,
  },
});

export default shopify;
export const apiVersion = ApiVersion.April26;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;
