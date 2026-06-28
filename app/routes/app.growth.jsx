import { json } from "@remix-run/node";
import { useFetcher, useLoaderData } from "@remix-run/react";
import { useEffect } from "react";
import { GrowthIntelligencePanel } from "../components/GrowthIntelligencePanel.jsx";
import { isPilotApp } from "../lib/env.server.js";
import { buildGrowthIntelligence } from "../lib/growth-intelligence.server.js";
import { executePamGrowthAction } from "../lib/predictacore-ads-client.server.js";

export async function loader({ request }) {
  const { authenticate } = await import("../shopify.server");
  const { admin, session } = await authenticate.admin(request);
  const { resolveShopLocale } = await import("../lib/locale.js");

  if (!isPilotApp()) {
    throw new Response("Growth intelligence is only available in pilot mode.", { status: 404 });
  }

  const url = new URL(request.url);
  const days = Math.min(90, Math.max(7, Number.parseInt(url.searchParams.get("days") ?? "30", 10) || 30));
  const locale = await resolveShopLocale(admin);

  const intelligence = await buildGrowthIntelligence({
    admin,
    shop: session.shop,
    days,
    locale,
    includeAi: url.searchParams.get("ai") !== "0",
  });

  return json({ intelligence, locale, days });
}

export async function action({ request }) {
  const { authenticate } = await import("../shopify.server");
  await authenticate.admin(request);

  if (!isPilotApp()) {
    return json({ error: "Not available" }, { status: 404 });
  }

  const form = await request.formData();
  const intent = form.get("intent");
  const growthAction = form.get("growthAction");

  if (intent === "growth-action" && growthAction) {
    try {
      const result = await executePamGrowthAction(String(growthAction));
      return json({ ok: true, message: result.message ?? "Listo", result });
    } catch (err) {
      return json({ ok: false, error: err.message ?? "Error" }, { status: 400 });
    }
  }

  return json({ error: "Unknown intent" }, { status: 400 });
}

export default function GrowthPage() {
  const { intelligence, locale } = useLoaderData();
  const fetcher = useFetcher();

  useEffect(() => {
    window.__growthAction = (action) => {
      const labels = {
        pause_active: locale === "es" ? "pausar la campaña activa" : "pause the active campaign",
        patch_shopify_image: locale === "es" ? "cambiar la imagen del anuncio" : "change the ad image",
        relaunch_purchase: locale === "es" ? "relanzar campaña Purchase" : "relaunch Purchase campaign",
      };
      if (!window.confirm(`${locale === "es" ? "¿Confirmas" : "Confirm"} ${labels[action] ?? action}?`)) return;
      fetcher.submit({ intent: "growth-action", growthAction: action }, { method: "post" });
    };
    return () => {
      delete window.__growthAction;
    };
  }, [fetcher, locale]);

  const loadingAction = fetcher.state !== "idle" ? fetcher.formData?.get("growthAction") : null;
  const actionResult = fetcher.data?.ok ? fetcher.data.message : null;
  const actionError = fetcher.data?.ok === false ? fetcher.data.error : null;

  return (
    <GrowthIntelligencePanel
      intelligence={intelligence}
      locale={locale}
      loadingAction={loadingAction}
      actionResult={actionResult}
      actionError={actionError}
    />
  );
}
