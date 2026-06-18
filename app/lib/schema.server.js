const METAFIELD_NAMESPACE = "predictacore";
const METAFIELD_KEY = "organization_json_ld";

const SHOP_ID_QUERY = `#graphql
  query PredictaCoreShopId {
    shop { id myshopifyDomain }
  }
`;

const METAFIELD_QUERY = `#graphql
  query PredictaCoreSchemaMetafield {
    shop {
      metafield(namespace: "${METAFIELD_NAMESPACE}", key: "${METAFIELD_KEY}") {
        value
      }
    }
  }
`;

const METAFIELDS_SET = `#graphql
  mutation PredictaCoreMetafieldsSet($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields { id namespace key }
      userErrors { field message }
    }
  }
`;

const METAFIELDS_DELETE = `#graphql
  mutation PredictaCoreMetafieldsDelete($metafields: [MetafieldIdentifierInput!]!) {
    metafieldsDelete(metafields: $metafields) {
      deletedMetafields { key }
      userErrors { field message }
    }
  }
`;

const METAFIELD_DEFINITION_CREATE = `#graphql
  mutation PredictaCoreMetafieldDefinitionCreate($definition: MetafieldDefinitionInput!) {
    metafieldDefinitionCreate(definition: $definition) {
      createdDefinition { id }
      userErrors { field message code }
    }
  }
`;

async function getShopGid(admin) {
  const response = await admin.graphql(SHOP_ID_QUERY);
  const { data, errors } = await response.json();
  if (errors?.length) throw new Error(errors.map((e) => e.message).join("; "));
  const id = data?.shop?.id;
  if (!id) throw new Error("Shop not found");
  return id;
}

async function readSchemaMetafield(admin) {
  const response = await admin.graphql(METAFIELD_QUERY);
  const { data, errors } = await response.json();
  if (errors?.length) throw new Error(errors.map((e) => e.message).join("; "));
  return data?.shop?.metafield?.value ?? "";
}

async function ensureSchemaMetafieldDefinition(admin) {
  const response = await admin.graphql(METAFIELD_DEFINITION_CREATE, {
    variables: {
      definition: {
        name: "PredictaCore Organization Schema",
        namespace: METAFIELD_NAMESPACE,
        key: METAFIELD_KEY,
        type: "json",
        ownerType: "SHOP",
        access: {
          storefront: "PUBLIC_READ",
        },
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

async function saveSchemaMetafield(admin, jsonLd) {
  await ensureSchemaMetafieldDefinition(admin);
  const shopId = await getShopGid(admin);
  const response = await admin.graphql(METAFIELDS_SET, {
    variables: {
      metafields: [
        {
          ownerId: shopId,
          namespace: METAFIELD_NAMESPACE,
          key: METAFIELD_KEY,
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
  return shopId;
}

async function deleteSchemaMetafield(admin) {
  const response = await admin.graphql(METAFIELDS_DELETE, {
    variables: {
      metafields: [{ namespace: METAFIELD_NAMESPACE, key: METAFIELD_KEY, ownerId: await getShopGid(admin) }],
    },
  });
  const { data, errors } = await response.json();
  if (errors?.length) throw new Error(errors.map((e) => e.message).join("; "));
  const userErrors = data?.metafieldsDelete?.userErrors ?? [];
  if (userErrors.length) throw new Error(userErrors.map((e) => e.message).join("; "));
}

export async function getSchemaStatus(shop) {
  try {
    const prisma = (await import("../db.server.js")).default;
    const profile = await prisma.entityProfile.findUnique({ where: { shop } });
    return {
      active: profile?.schemaActive ?? false,
      themeId: profile?.schemaThemeId ?? null,
    };
  } catch {
    return { active: false, themeId: null };
  }
}

export async function applySchemaToTheme(admin, shop, jsonLd) {
  const prisma = (await import("../db.server.js")).default;
  const originalValue = await readSchemaMetafield(admin);
  const shopId = await saveSchemaMetafield(admin, jsonLd);

  await prisma.entityProfile.upsert({
    where: { shop },
    create: {
      shop,
      schemaActive: true,
      schemaThemeId: shopId,
      jsonLdDraft: JSON.stringify(jsonLd, null, 2),
    },
    update: {
      schemaActive: true,
      schemaThemeId: shopId,
      jsonLdDraft: JSON.stringify(jsonLd, null, 2),
    },
  });

  return {
    applied: true,
    method: "metafield",
    shopId,
    originals: { metafield: originalValue },
  };
}

export async function deactivateSchemaForShop(admin, shop) {
  const prisma = (await import("../db.server.js")).default;
  try {
    await deleteSchemaMetafield(admin);
  } catch {
    // Metafield may already be absent
  }
  await prisma.entityProfile.updateMany({
    where: { shop },
    data: { schemaActive: false, schemaThemeId: null },
  });
}

export async function rollbackSchemaFromTheme(admin, shop, snapshots) {
  const prisma = (await import("../db.server.js")).default;
  const schemaSnaps = snapshots.filter(
    (s) => s.resourceType === "shop" || s.resourceType === "theme",
  );
  if (schemaSnaps.length === 0) return;

  const metafieldSnap = schemaSnaps.find((s) => s.field?.includes("metafield"));
  if (metafieldSnap) {
    if (metafieldSnap.originalValue) {
      const response = await admin.graphql(METAFIELDS_SET, {
        variables: {
          metafields: [
            {
              ownerId: metafieldSnap.resourceId,
              namespace: METAFIELD_NAMESPACE,
              key: METAFIELD_KEY,
              type: "json",
              value: metafieldSnap.originalValue,
            },
          ],
        },
      });
      await response.json();
    } else {
      try {
        await deleteSchemaMetafield(admin);
      } catch {
        // Metafield may already be absent
      }
    }
  }

  await prisma.entityProfile.updateMany({
    where: { shop },
    data: { schemaActive: false, schemaThemeId: null },
  });
}

export async function saveWebsiteJsonLd(admin, shop) {
  const { buildWebsiteJsonLd, WEBSITE_JSON_LD_KEY } = await import("./product-schema.server.js");
  const websiteLd = buildWebsiteJsonLd(shop);
  const shopId = await getShopGid(admin);
  const response = await admin.graphql(METAFIELDS_SET, {
    variables: {
      metafields: [
        {
          ownerId: shopId,
          namespace: METAFIELD_NAMESPACE,
          key: WEBSITE_JSON_LD_KEY,
          type: "json",
          value: JSON.stringify(websiteLd),
        },
      ],
    },
  });
  const { data, errors } = await response.json();
  if (errors?.length) throw new Error(errors.map((e) => e.message).join("; "));
  const userErrors = data?.metafieldsSet?.userErrors ?? [];
  if (userErrors.length) throw new Error(userErrors.map((e) => e.message).join("; "));
}
