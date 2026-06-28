import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { useEffect } from "react";
import { authenticate } from "../shopify.server";
import { buildSearchConsoleAuthUrl } from "../lib/search-console.server.js";
import crypto from "node:crypto";

/** Google OAuth must open in top window — iframe embed returns Google 403. */
export async function loader({ request }) {
  const { session } = await authenticate.admin(request);
  const state = crypto.randomBytes(16).toString("hex");
  const url = buildSearchConsoleAuthUrl(session.shop, state);
  return json({ url });
}

export default function SearchConsoleAuth() {
  const { url } = useLoaderData();

  useEffect(() => {
    if (typeof window !== "undefined" && url) {
      window.top.location.assign(url);
    }
  }, [url]);

  return (
    <div style={{ padding: "24px", color: "#e2e8f0", fontFamily: "system-ui, sans-serif" }}>
      <p style={{ marginBottom: "12px" }}>Redirecting to Google Search Console…</p>
      <a href={url} target="_top" rel="noopener noreferrer" style={{ color: "#a5b4fc" }}>
        Click here if Google does not open
      </a>
    </div>
  );
}
