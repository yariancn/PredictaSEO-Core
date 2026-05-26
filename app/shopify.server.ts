import "@shopify/shopify-app-remix/adapters/node";
import {
  shopifyApp,
  AppDistribution,
  ApiVersion,
  BillingInterval,
} from "@shopify/shopify-app-remix/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma from "./db.server";
import { getShopifyAppUrl, getShopifyScopes } from "./lib/env.server";

export const SETUP_PLAN = "SETUP";
export const MAINTENANCE_PLAN = "MAINTENANCE";

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY || process.env.SHOPIFY_CLIENT_ID,
  apiSecretKey:
    process.env.SHOPIFY_API_SECRET || process.env.SHOPIFY_CLIENT_SECRET || "",
  apiVersion: ApiVersion.April26,
  scopes: getShopifyScopes(),
  appUrl: getShopifyAppUrl(),
  authPathPrefix: "/auth",
  sessionStorage: new PrismaSessionStorage(prisma),
  distribution: AppDistribution.AppStore,
  billing: {
    [SETUP_PLAN]: {
      lineItems: [
        {
          amount: 35,
          currencyCode: "USD",
          interval: BillingInterval.OneTime,
        },
      ],
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
