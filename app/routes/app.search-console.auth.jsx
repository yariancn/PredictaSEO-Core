import { redirect } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { buildSearchConsoleAuthUrl } from "../lib/search-console.server.js";
import crypto from "node:crypto";

export async function loader({ request }) {
  const { session } = await authenticate.admin(request);
  const state = crypto.randomBytes(16).toString("hex");
  const url = buildSearchConsoleAuthUrl(session.shop, state);
  return redirect(url);
}

export default function SearchConsoleAuth() {
  return null;
}
