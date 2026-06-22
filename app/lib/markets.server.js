/** @typedef {{ code: string, name: string, source: string }} MarketCountry */
/** @typedef {{ id?: string, name: string, primary: boolean, countries: MarketCountry[] }} ParsedMarket */
/** @typedef {{
 *   markets: ParsedMarket[],
 *   countries: MarketCountry[],
 *   countryCodes: string[],
 *   countryNames: string[],
 *   primaryMarket: ParsedMarket | null,
 *   regionLabel: string,
 *   regionLabelShort: string,
 *   shippingPhrase: string,
 *   languageCode: string,
 *   languageName: string,
 *   currencyCode: string,
 *   configured: boolean,
 *   source: string,
 *   warnings: string[],
 * }} MarketContext */

const COUNTRY_NAME_TO_CODE = {
  argentina: "AR",
  mexico: "MX",
  méxico: "MX",
  brazil: "BR",
  brasil: "BR",
  chile: "CL",
  colombia: "CO",
  peru: "PE",
  perú: "PE",
  uruguay: "UY",
  paraguay: "PY",
  bolivia: "BO",
  ecuador: "EC",
  venezuela: "VE",
  "united states": "US",
  usa: "US",
  canada: "CA",
  "united kingdom": "GB",
  uk: "GB",
  spain: "ES",
  españa: "ES",
  france: "FR",
  germany: "DE",
  italy: "IT",
  china: "CN",
  japan: "JP",
  australia: "AU",
  india: "IN",
};

const CODE_TO_ENGLISH_NAME = {
  AR: "Argentina",
  MX: "Mexico",
  BR: "Brazil",
  CL: "Chile",
  CO: "Colombia",
  PE: "Peru",
  UY: "Uruguay",
  PY: "Paraguay",
  BO: "Bolivia",
  EC: "Ecuador",
  VE: "Venezuela",
  US: "United States",
  CA: "Canada",
  GB: "United Kingdom",
  ES: "Spain",
  FR: "France",
  DE: "Germany",
  IT: "Italy",
  CN: "China",
  JP: "Japan",
  AU: "Australia",
  IN: "India",
};

const LOCALE_LANGUAGE = {
  en: "English",
  es: "Spanish",
  fr: "French",
  pt: "Portuguese",
  de: "German",
  it: "Italian",
  ja: "Japanese",
  zh: "Chinese",
};

function normalizeCountryCode(raw) {
  const value = String(raw ?? "").trim().toUpperCase();
  if (/^[A-Z]{2}$/.test(value)) return value;
  return COUNTRY_NAME_TO_CODE[String(raw ?? "").trim().toLowerCase()] ?? null;
}

function countryFromName(name, source = "market_name") {
  const code = normalizeCountryCode(name);
  if (!code) return null;
  return {
    code,
    name: CODE_TO_ENGLISH_NAME[code] ?? String(name).trim(),
    source,
  };
}

function dedupeCountries(list) {
  const seen = new Set();
  const out = [];
  for (const item of list) {
    if (!item?.code || seen.has(item.code)) continue;
    seen.add(item.code);
    out.push(item);
  }
  return out;
}

function parseMarketRegions(marketNode) {
  const regions = marketNode?.regions?.nodes ?? [];
  const countries = [];
  for (const region of regions) {
    const code = normalizeCountryCode(region?.code ?? region?.name);
    if (!code) continue;
    countries.push({
      code,
      name: region?.name?.trim() || CODE_TO_ENGLISH_NAME[code] || code,
      source: "market_region",
    });
  }
  if (countries.length === 0) {
    const inferred = countryFromName(marketNode?.name, "market_name");
    if (inferred) countries.push(inferred);
  }
  return countries;
}

function formatRegionLabel(countries, max = 3) {
  if (countries.length === 0) return "your markets";
  const names = countries.map((c) => c.name);
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  if (names.length <= max) return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
  return `${names.slice(0, max).join(", ")} +${names.length - max} more`;
}

function buildShippingPhrase(countries, languageCode = "en") {
  const label = formatRegionLabel(countries, 4);
  if (languageCode.startsWith("es")) {
    return `Envío disponible en ${label}.`;
  }
  if (languageCode.startsWith("fr")) {
    return `Livraison disponible en ${label}.`;
  }
  if (languageCode.startsWith("pt")) {
    return `Entrega disponível em ${label}.`;
  }
  return `Shipping available across ${label}.`;
}

function resolvePrimaryLanguage(locales = [], fallback = "en") {
  const published = locales.filter((l) => l.published);
  const primary = published.find((l) => l.primary) ?? published[0];
  const code = (primary?.locale ?? fallback).split("-")[0].toLowerCase();
  return {
    languageCode: code,
    languageName: LOCALE_LANGUAGE[code] ?? primary?.name ?? "English",
    locale: primary?.locale ?? fallback,
  };
}

/**
 * Build merchant market context from Shopify Admin catalog payload.
 * @param {object} data - GraphQL catalog data
 * @param {object} [overrides]
 * @returns {MarketContext}
 */
export function buildMarketContext(data, overrides = {}) {
  const warnings = [];
  const shop = data?.shop ?? {};
  const enabledMarkets = (data?.markets?.nodes ?? []).filter((m) => m.enabled !== false);
  const locales = data?.shopLocales ?? [];

  const parsedMarkets = enabledMarkets.map((market) => ({
    id: market.id,
    name: market.name,
    primary: Boolean(market.primary),
    countries: parseMarketRegions(market),
  }));

  let countries = dedupeCountries(parsedMarkets.flatMap((m) => m.countries));

  if (countries.length === 0 && shop.billingAddress?.country) {
    const billing = countryFromName(shop.billingAddress.country, "billing_address");
    if (billing) {
      countries = [billing];
      warnings.push("No Shopify Markets detected — using shop billing country as fallback.");
    }
  }

  if (overrides.countryCodes?.length) {
    countries = dedupeCountries(
      overrides.countryCodes.map((code) => ({
        code: normalizeCountryCode(code),
        name: CODE_TO_ENGLISH_NAME[normalizeCountryCode(code)] ?? code,
        source: "merchant_override",
      })).filter((c) => c.code),
    );
  }

  const language = resolvePrimaryLanguage(locales, overrides.languageCode ?? "en");
  const primaryMarket = parsedMarkets.find((m) => m.primary) ?? parsedMarkets[0] ?? null;
  const regionLabel = formatRegionLabel(countries);
  const regionLabelShort =
    countries.length === 1 ? countries[0].name : formatRegionLabel(countries, 2);

  return {
    markets: parsedMarkets,
    countries,
    countryCodes: countries.map((c) => c.code),
    countryNames: countries.map((c) => c.name),
    primaryMarket,
    regionLabel,
    regionLabelShort,
    shippingPhrase: buildShippingPhrase(countries, language.languageCode),
    languageCode: language.languageCode,
    languageName: language.languageName,
    currencyCode: shop.currencyCode ?? "USD",
    configured: parsedMarkets.length > 0 || countries.length > 0,
    source: parsedMarkets.length > 0 ? "shopify_markets" : countries.length > 0 ? "fallback" : "unknown",
    warnings,
    confirmed: Boolean(overrides.confirmed),
    publishedLocales: (locales ?? [])
      .filter((l) => l.published)
      .map((l) => ({ locale: l.locale, name: l.name, primary: Boolean(l.primary) })),
  };
}

export function marketContextLabel(context) {
  if (!context?.countries?.length) return "Markets not configured";
  return context.regionLabel;
}

export function buildAreaServedJsonLd(countries) {
  return (countries ?? []).map((c) => ({
    "@type": "Country",
    name: c.name,
    ...(c.code ? { identifier: c.code } : {}),
  }));
}

/** Detect SEO copy that targets the wrong geography. */
export function detectGeoMismatch(text, targetCodes = []) {
  const value = String(text ?? "").toLowerCase();
  if (!value || targetCodes.length === 0) return false;

  const wrongRegionPatterns = [
    /\bus\s*&?\s*canada\b/,
    /\bunited states\b/,
    /\bfor usa\b/,
    /\bnorth america only\b/,
  ];

  const targetsLatinAmerica = targetCodes.some((c) =>
    ["AR", "MX", "BR", "CL", "CO", "PE", "UY", "PY", "BO", "EC", "VE"].includes(c),
  );
  const targetsOnlyUs = targetCodes.every((c) => ["US", "CA"].includes(c));

  if (targetsLatinAmerica && wrongRegionPatterns.some((re) => re.test(value))) return true;
  if (!targetsOnlyUs && /\bus\s*&?\s*canada\b/.test(value) && !targetCodes.includes("US")) return true;
  return false;
}

export function serializeMarketContext(context) {
  return JSON.stringify({
    countryCodes: context.countryCodes,
    confirmed: context.confirmed,
    regionLabel: context.regionLabel,
  });
}

export function parseStoredMarketContext(raw) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return {
      countryCodes: parsed.countryCodes ?? [],
      confirmed: Boolean(parsed.confirmed),
      regionLabel: parsed.regionLabel ?? "",
    };
  } catch {
    return null;
  }
}
