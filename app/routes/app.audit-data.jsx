import { json } from "@remix-run/node";
import { loadAuditData } from "../lib/audit.server.js";

export async function loader({ request }) {
  try {
    const data = await loadAuditData(request);
    return json(data);
  } catch (err) {
    return json({
      shop: "",
      error: err.message ?? "Unable to load audit data",
    });
  }
}

export function shouldRevalidate() {
  return false;
}

export async function headers(headersArgs) {
  const { boundary } = await import("@shopify/shopify-app-remix/server");
  return boundary.headers(headersArgs);
}

export default function AuditDataRoute() {
  return null;
}
