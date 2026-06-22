import { buildSeoProposal, buildProductDescriptionHtml } from "./content-engine.server.js";

const TRANSLATIONS_REGISTER = `#graphql
  mutation PredictaCoreTranslationsRegister($resourceId: ID!, $translations: [TranslationInput!]!) {
    translationsRegister(resourceId: $resourceId, translations: $translations) {
      userErrors { field message }
      translations { key locale value }
    }
  }
`;

function localeLanguageCode(locale) {
  return String(locale ?? "en").split("-")[0].toLowerCase();
}

function secondaryLocales(marketContext) {
  const primary = marketContext?.languageCode ?? "en";
  const published = marketContext?.publishedLocales ?? [];
  return published
    .filter((l) => !l.primary && localeLanguageCode(l.locale) !== primary)
    .map((l) => l.locale);
}

function marketContextForLocale(marketContext, locale) {
  const code = localeLanguageCode(locale);
  const names = {
    en: "English",
    es: "Spanish",
    fr: "French",
    pt: "Portuguese",
    de: "German",
    it: "Italian",
  };
  return {
    ...marketContext,
    languageCode: code,
    languageName: names[code] ?? locale,
  };
}

/**
 * Register Shopify Translation API entries for secondary storefront locales.
 * Primary locale is written via productUpdate; this covers published alternates.
 */
export async function registerProductLocaleTranslations(admin, item, shopName, marketContext) {
  const locales = secondaryLocales(marketContext);
  if (!locales.length || !item?.id) return { registered: 0 };

  const category = item.category ?? "Product";
  const product = item.productSnapshot ?? {
    id: item.id,
    title: item.title,
    handle: item.handle,
    vendor: "",
    productType: "",
    tags: [],
    descriptionHtml: item.originals?.descriptionHtml ?? "",
  };

  const translations = [];
  for (const locale of locales) {
    const ctx = marketContextForLocale(marketContext, locale);
    const proposed = buildSeoProposal(product, shopName, category, ctx);

    if (item.changes?.seoTitle) {
      translations.push({
        locale,
        key: "meta_title",
        value: proposed.seoTitle.slice(0, 70),
      });
    }
    if (item.changes?.seoDescription) {
      translations.push({
        locale,
        key: "meta_description",
        value: proposed.seoDescription.slice(0, 160),
      });
    }
    if (item.changes?.descriptionHtml) {
      translations.push({
        locale,
        key: "body_html",
        value: buildProductDescriptionHtml(product, shopName, ctx),
      });
    }
  }

  if (!translations.length) return { registered: 0 };

  const response = await admin.graphql(TRANSLATIONS_REGISTER, {
    variables: { resourceId: item.id, translations },
  });
  const { data, errors } = await response.json();
  if (errors?.length) {
    return { registered: 0, error: errors.map((e) => e.message).join("; ") };
  }

  const userErrors = data?.translationsRegister?.userErrors ?? [];
  if (userErrors.length) {
    return { registered: 0, error: userErrors.map((e) => e.message).join("; ") };
  }

  return {
    registered: data?.translationsRegister?.translations?.length ?? translations.length,
  };
}
