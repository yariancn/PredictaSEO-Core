import { redirect } from "@remix-run/node";
import { getShopifyAppHandle } from "../lib/env.server.js";
import {
  exchangeSearchConsoleCode,
  resolveSearchConsoleSiteUrl,
  saveSearchConsoleTokens,
} from "../lib/search-console.server.js";

function adminAppReturnUrl(shop, params = "") {
  const slug = shop.replace(".myshopify.com", "");
  const base = `https://admin.shopify.com/store/${slug}/apps/${getShopifyAppHandle()}`;
  return params ? `${base}?${params}` : base;
}

/** Outside embedded /app layout — Google redirect has no Shopify session cookies. */
export async function loader({ request }) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state") ?? "";
  const [shop] = state.split("::");

  if (!code || !shop?.includes(".myshopify.com")) {
    return redirect(adminAppReturnUrl(shop ?? "unknown.myshopify.com", "gsc=error"));
  }

  try {
    const tokens = await exchangeSearchConsoleCode(code);
    const siteUrl =
      url.searchParams.get("site") ??
      (await resolveSearchConsoleSiteUrl(tokens.access_token, shop));
    await saveSearchConsoleTokens(shop, tokens, siteUrl);
    return redirect(adminAppReturnUrl(shop, "gsc=connected"));
  } catch {
    return redirect(adminAppReturnUrl(shop, "gsc=error"));
  }
}

export default function SearchConsoleOAuthCallback() {
  return null;
}
