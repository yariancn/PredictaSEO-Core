const METAFIELD_NAMESPACE = "predictacore";
const PRODUCT_JSON_LD_KEY = "product_json_ld";
const WEBSITE_JSON_LD_KEY = "website_json_ld";

const PRODUCT_METAFIELD_DEFINITION = `#graphql
  mutation PredictaCoreProductSchemaDef($definition: MetafieldDefinitionInput!) {
    metafieldDefinitionCreate(definition: $definition) {
      createdDefinition { id }
      userErrors { field message code }
    }
  }
`;

const METAFIELDS_SET = `#graphql
  mutation PredictaCoreProductSchemaSet($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields { id }
      userErrors { field message }
    }
  }
`;

const METAFIELDS_DELETE = `#graphql
  mutation PredictaCoreProductSchemaDelete($metafields: [MetafieldIdentifierInput!]!) {
    metafieldsDelete(metafields: $metafields) {
      deletedMetafields { key }
      userErrors { field message }
    }
  }
`;

function availabilityUrl(variant, product) {
  if (variant?.availableForSale === false) return "https://schema.org/OutOfStock";
  if (product?.hasOutOfStockVariants && (variant?.inventoryQuantity ?? 0) <= 0) {
    return "https://schema.org/OutOfStock";
  }
  return "https://schema.org/InStock";
}

function buildOffers(product, shop, productUrl) {
  const currency = shop?.currencyCode ?? "USD";
  const variants = (product?.variants?.nodes ?? []).filter(Boolean);
  if (!variants.length) return undefined;

  const priced = variants
    .map((v) => ({
      ...v,
      priceNum: parseFloat(String(v.price ?? "0")),
    }))
    .filter((v) => Number.isFinite(v.priceNum) && v.priceNum > 0);

  if (!priced.length) return undefined;

  if (priced.length === 1) {
    const v = priced[0];
    return {
      "@type": "Offer",
      url: productUrl,
      priceCurrency: currency,
      price: v.priceNum.toFixed(2),
      availability: availabilityUrl(v, product),
      ...(v.sku ? { sku: v.sku } : {}),
      itemCondition: "https://schema.org/NewCondition",
    };
  }

  const prices = priced.map((v) => v.priceNum);
  const low = Math.min(...prices);
  const high = Math.max(...prices);
  const anyAvailable = priced.some((v) => availabilityUrl(v, product).includes("InStock"));

  return {
    "@type": "AggregateOffer",
    url: productUrl,
    priceCurrency: currency,
    lowPrice: low.toFixed(2),
    highPrice: high.toFixed(2),
    offerCount: priced.length,
    availability: anyAvailable
      ? "https://schema.org/InStock"
      : "https://schema.org/OutOfStock",
  };
}

function primaryGtin(variants) {
  for (const v of variants ?? []) {
    const code = String(v?.barcode ?? "").trim();
    if (/^\d{8,14}$/.test(code)) return code;
  }
  return undefined;
}

function primarySku(product, variants) {
  for (const v of variants ?? []) {
    const sku = String(v?.sku ?? "").trim();
    if (sku) return sku;
  }
  return product.id?.split("/").pop();
}

export function buildProductJsonLd(product, shop, marketContext) {
  const urlBase = shop.primaryDomain?.url ?? `https://${shop.myshopifyDomain}`;
  const productUrl = `${urlBase.replace(/\/$/, "")}/products/${product.handle}`;
  const inLanguage = marketContext?.languageCode ?? "en";
  const variants = product?.variants?.nodes ?? [];
  const offers = buildOffers(product, shop, productUrl);
  const gtin = primaryGtin(variants);
  const sku = primarySku(product, variants);
  const imageUrl = product.featuredImage?.url ?? product.images?.nodes?.[0]?.url;

  const ld = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.title,
    description:
      (product.seo?.description ?? "").trim() ||
      String(product.descriptionHtml ?? product.description ?? "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 500),
    url: productUrl,
    sku,
    brand: {
      "@type": "Brand",
      name: product.vendor?.trim() || shop.name,
    },
    category: product.productType?.trim() || undefined,
    inLanguage,
    ...(imageUrl ? { image: [imageUrl] } : {}),
    ...(gtin ? { gtin13: gtin.length === 13 ? gtin : undefined, gtin: gtin.length !== 13 ? gtin : undefined } : {}),
    ...(offers ? { offers } : {}),
    ...(marketContext?.countryCodes?.length
      ? {
          areaServed: marketContext.countryCodes.map((code) => ({
            "@type": "Country",
            identifier: code,
          })),
        }
      : {}),
  };

  if (ld.gtin13 === undefined) delete ld.gtin13;
  if (ld.gtin === undefined) delete ld.gtin;

  return ld;
}

export function buildWebsiteJsonLd(shop) {
  const url = shop.primaryDomain?.url ?? `https://${shop.myshopifyDomain}`;
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: shop.name,
    url,
    potentialAction: {
      "@type": "SearchAction",
      target: `${url.replace(/\/$/, "")}/search?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };
}

async function ensureProductMetafieldDefinition(admin) {
  const response = await admin.graphql(PRODUCT_METAFIELD_DEFINITION, {
    variables: {
      definition: {
        name: "PredictaCore Product JSON-LD",
        namespace: METAFIELD_NAMESPACE,
        key: PRODUCT_JSON_LD_KEY,
        type: "json",
        ownerType: "PRODUCT",
        access: { storefront: "PUBLIC_READ" },
      },
    },
  });
  const { data, errors } = await response.json();
  if (errors?.length) throw new Error(errors.map((e) => e.message).join("; "));
  const userErrors = data?.metafieldDefinitionCreate?.userErrors ?? [];
  const blocking = userErrors.filter(
    (e) => e.code !== "TAKEN" && !String(e.message).toLowerCase().includes("taken"),
  );
  if (blocking.length) throw new Error(blocking.map((e) => e.message).join("; "));
}

export async function saveProductJsonLd(admin, product, jsonLd) {
  await ensureProductMetafieldDefinition(admin);
  const response = await admin.graphql(METAFIELDS_SET, {
    variables: {
      metafields: [
        {
          ownerId: product.id,
          namespace: METAFIELD_NAMESPACE,
          key: PRODUCT_JSON_LD_KEY,
          type: "json",
          value: JSON.stringify(jsonLd),
        },
      ],
    },
  });
  const { data, errors } = await response.json();
  if (errors?.length) throw new Error(errors.map((e) => e.message).join("; "));
  const userErrors = data?.metafieldsSet?.userErrors ?? [];
  if (userErrors.length) throw new Error(userErrors.map((e) => e.message).join("; "));
}

export async function deleteProductJsonLd(admin, productId) {
  const response = await admin.graphql(METAFIELDS_DELETE, {
    variables: {
      metafields: [
        {
          ownerId: productId,
          namespace: METAFIELD_NAMESPACE,
          key: PRODUCT_JSON_LD_KEY,
        },
      ],
    },
  });
  await response.json();
}

export { METAFIELD_NAMESPACE, PRODUCT_JSON_LD_KEY, WEBSITE_JSON_LD_KEY };
