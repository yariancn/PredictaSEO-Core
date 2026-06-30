import { detectGeoMismatch } from "./markets.server.js";

/**
 * Post-apply and pre-submit validation report (internal — not a third-party guarantee).
 */
export function buildValidationReport({
  executive,
  marketContext,
  preview,
  applyResult = null,
  schemaActive = false,
}) {
  const passed = [];
  const warnings = [];
  const blockers = [];

  if (marketContext?.configured) {
    passed.push("markets_detected");
  } else {
    blockers.push("markets_not_configured");
  }

  if (marketContext?.confirmed) {
    passed.push("markets_confirmed");
  } else if (marketContext?.configured) {
    warnings.push("markets_not_confirmed");
  }

  if (marketContext?.countryCodes?.length) {
    passed.push("target_countries_resolved");
  } else {
    warnings.push("no_country_codes");
  }

  const priorityProducts = executive?.priorityProducts ?? [];
  const mismatches = priorityProducts.filter((p) =>
    detectGeoMismatch(`${p.seo?.title ?? ""} ${p.seo?.description ?? ""}`, marketContext?.countryCodes ?? []),
  );
  if (mismatches.length === 0) {
    passed.push("geo_alignment");
  } else {
    warnings.push(`geo_mismatch_${mismatches.length}_products`);
  }

  if (schemaActive || applyResult?.schemaApplied) {
    passed.push("brand_schema_active");
  } else if (preview?.schema?.willApply) {
    warnings.push("brand_schema_pending");
  } else {
    warnings.push("brand_schema_missing");
  }

  if (preview?.productCount > 0 || applyResult?.productCount > 0) {
    passed.push("product_optimizations_planned_or_applied");
  }

  if (applyResult) {
    if (applyResult.schemaApplied) passed.push("apply_schema_saved");
    if ((applyResult.productCount ?? applyResult.applied ?? 0) > 0) passed.push("apply_products_updated");
    if (applyResult.errors?.length) warnings.push("apply_partial_errors");
  }

  const probabilistic = executive?.probabilistic;
  const scoreDelta =
    applyResult && probabilistic
      ? (executive?.score ?? 0) - (applyResult.scoreBefore ?? executive?.score ?? 0)
      : null;

  const readyForSubmit = blockers.length === 0 && warnings.filter((w) => w.startsWith("geo_mismatch")).length === 0;

  return {
    passed,
    warnings,
    blockers,
    readyForSubmit,
    scoreDelta,
    marketCoverage: marketContext?.regionLabel ?? "",
    countryCount: marketContext?.countryCodes?.length ?? 0,
    summaryKey: readyForSubmit ? "validationSummaryPass" : "validationSummaryReview",
  };
}

export function buildLlmsTxtForShop(shop, marketContext) {
  const url = shop?.primaryDomain?.url ?? `https://${shop?.myshopifyDomain ?? "store"}`;
  const regions = marketContext?.regionLabel ?? "configured Shopify markets";
  return `# ${shop?.name ?? "Store"}

> ${shop?.name ?? "This store"} sells via Shopify. Optimized for AI search visibility with PredictaCore.

## Store
- URL: ${url}
- Markets: ${regions}
- Languages: ${marketContext?.languageName ?? "English"}

## Products
Product pages include structured data (JSON-LD) when optimized through PredictaCore.

## Contact
See store website for merchant contact and policies.
`;
}

export async function saveLlmsTxtMetafield(admin, shopRecord, marketContext) {
  const text = buildLlmsTxtForShop(shopRecord, marketContext);
  if (!admin?.graphql) return false;

  let shopId = shopRecord?.id ?? null;
  if (!shopId) {
    const idRes = await admin.graphql(`#graphql
      query PredictaCoreShopIdForLlms { shop { id } }
    `);
    const idJson = await idRes.json();
    shopId = idJson?.data?.shop?.id ?? null;
  }
  if (!shopId) return false;

  const response = await admin.graphql(
    `#graphql
    mutation PredictaCoreLlmsTxt($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        userErrors { message }
      }
    }`,
    {
      variables: {
        metafields: [
          {
            ownerId: shopId,
            namespace: "predictacore",
            key: "llms_txt",
            type: "multi_line_text_field",
            value: text,
          },
        ],
      },
    },
  );
  const { errors, data } = await response.json();
  const userErrors = data?.metafieldsSet?.userErrors ?? [];
  return !errors?.length && userErrors.length === 0;
}
