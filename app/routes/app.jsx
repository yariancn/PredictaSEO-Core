import { json } from "@remix-run/node";
import { Outlet, useLoaderData, useRouteError, isRouteErrorResponse } from "@remix-run/react";
import { AppProvider } from "@shopify/shopify-app-remix/react";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";
import { AppErrorShell, routeErrorHint, routeErrorMessage } from "../components/AppErrorShell.jsx";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

import { getShopifyApiKey } from "../lib/env.server";

export async function loader({ request }) {
  const { authenticate } = await import("../shopify.server");
  await authenticate.admin(request);
  return json({
    apiKey: getShopifyApiKey(),
  });
}

export function shouldRevalidate() {
  return false;
}

export default function AppLayout() {
  const { apiKey } = useLoaderData();

  return (
    <AppProvider isEmbeddedApp apiKey={apiKey}>
      <div style={{ minHeight: "100vh", background: "#0c0c14" }}>
        <Outlet />
      </div>
    </AppProvider>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();

  if (isRouteErrorResponse(error) && typeof error.data === "string" && error.data.trim().length > 0) {
    return <div dangerouslySetInnerHTML={{ __html: error.data }} />;
  }

  const message = isRouteErrorResponse(error)
    ? `${error.status} — ${error.statusText || "Unable to load"}`
    : routeErrorMessage(error);

  return <AppErrorShell message={message} hint={routeErrorHint(error)} />;
}

export async function headers(headersArgs) {
  const { boundary } = await import("@shopify/shopify-app-remix/server");
  return boundary.headers(headersArgs);
}
