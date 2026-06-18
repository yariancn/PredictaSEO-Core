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

export function buildProductJsonLd(product, shop, marketContext) {
  const urlBase = shop.primaryDomain?.url ?? `https://${shop.myshopifyDomain}`;
  const productUrl = `${urlBase.replace(/\/$/, "")}/products/${product.handle}`;
  const inLanguage = marketContext?.languageCode ?? "en";

  return {
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
    sku: product.id?.split("/").pop(),
    brand: {
      "@type": "Brand",
      name: product.vendor?.trim() || shop.name,
    },
    category: product.productType?.trim() || undefined,
    inLanguage,
    ...(marketContext?.countryCodes?.length
      ? {
          areaServed: marketContext.countryCodes.map((code) => ({
            "@type": "Country",
            identifier: code,
          })),
        }
      : {}),
  };
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
