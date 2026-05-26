import { t as translate } from "./locale.js";

function normalizeCategoryName(name) {
  const n = (name || "").trim().toLowerCase();
  if (n.includes("snowboard")) return "Snowboards";
  if (n.includes("gift")) return "Gift Cards";
  if (n.includes("wax") || n.includes("ski") || n.includes("accessori")) return "Accessories";
  if (!n) return "General";
  return name.trim().charAt(0).toUpperCase() + name.trim().slice(1).toLowerCase();
}

export function inferProductCategory(product) {
  const type = product.productType?.trim();
  if (type) return normalizeCategoryName(type);

  const title = (product.title || "").toLowerCase();
  if (title.includes("snowboard")) return "Snowboards";
  if (title.includes("gift")) return "Gift Cards";
  if (title.includes("wax") || title.includes("ski")) return "Accessories";
  return "General";
}

export function groupProductsByCategory(products, matrix) {
  const scoreMap = new Map(matrix.map((r) => [r.product.id, r]));

  const groups = {};

  for (const product of products) {
    const name = inferProductCategory(product);
    if (!groups[name]) {
      groups[name] = {
        name,
        count: 0,
        highPriority: 0,
        sampleTitles: [],
        seoTitlePattern: "{product_title} | Premium {category} — US & Canada",
        seoDescPattern:
          "Shop {product_title} at {shop_name}. Premium {category_lower} for US & Canada riders. Fast shipping.",
      };
    }

    groups[name].count += 1;
    const row = scoreMap.get(product.id);
    if (row?.viability === "ALTA") groups[name].highPriority += 1;
    if (groups[name].sampleTitles.length < 3) {
      groups[name].sampleTitles.push(product.title);
    }
  }

  return Object.values(groups).sort((a, b) => b.highPriority - a.highPriority || b.count - a.count);
}

export function buildOrganizationJsonLd(shop, markets, locations) {
  const areaServed = markets.map((m) => m.name);
  const primaryLocation = locations.find((l) => l.isActive)?.address;

  return {
    "@context": "https://schema.org",
    "@type": ["Organization", "Store"],
    name: shop.name,
    url: shop.primaryDomain?.url ?? `https://${shop.myshopifyDomain}`,
    email: shop.email ?? undefined,
    areaServed: areaServed.map((name) => ({ "@type": "Country", name })),
    ...(primaryLocation?.country
      ? {
          address: {
            "@type": "PostalAddress",
            addressCountry: primaryLocation.country,
            addressLocality: primaryLocation.city ?? undefined,
            addressRegion: primaryLocation.province ?? undefined,
          },
        }
      : {}),
    knowsAbout: ["Winter sports", "Snowboards", "E-commerce"],
  };
}

export function buildForenseReport(data, executive, snapshot, categories, locale = "en", preview = null) {
  const tr = (key, vars) => translate(locale, key, vars);
  const mirrorProducts = snapshot.matrix.filter((r) => r.viability === "ALTA").slice(0, 3);

  const problems = executive.scoreFactors.filter((f) => !f.ok).map((f) => f.label).slice(0, 4);

  const fixes = [];
  if (preview?.productCount > 0) {
    fixes.push(
      tr("fixBatch", { count: preview.productCount, batches: preview.batchCount }),
    );
  } else {
    fixes.push(tr("fixSeoDone"));
  }
  if (preview?.schema?.willApply) {
    fixes.push(tr("fixSchema"));
  } else if (!executive.scoreFactors.find((f) => f.id === "schema")?.ok) {
    fixes.push(tr("fixSchema"));
  }
  if (mirrorProducts.length > 0 && preview?.productCount > 0) {
    fixes.push(tr("fixMirror", { count: mirrorProducts.length }));
  }

  return {
    problems,
    fixes,
    mirrorProducts: mirrorProducts.map((r) => r.product.title),
    categories: categories.map((c) => ({
      name: c.name,
      count: c.count,
      fix: tr("fixCategory", { count: c.count }),
    })),
    scoreNow: executive.score,
    foundationScore: executive.foundationScore,
    scoreTarget: executive.scoreAfterApply,
  };
}

export async function generateForenseBrief(shop, markets, report, locale = "en") {
  const { askGeminiWithTimeout } = await import("./gemini.server.js");
  const lang = locale === "es" ? "Spanish" : locale === "fr" ? "French" : "English";

  const prompt = `You write for a Shopify store owner with no technical background. Reply in ${lang}. Plain, friendly language only.

Rules:
- Focus on AI SEARCH visibility — how AI-powered search finds and recommends stores
- Say "AI search" — never say computers, Siri, Alexa, Cortana, Google, or ChatGPT
- NO jargon: Schema.org, metadata, SEO, structured data, crawlers, index
- Say "search title" and "product description" — not SEO title
- Max 3 short sentences. No headers, markdown, or bullet points.

Store: ${shop.name} | Score: ${report.scoreNow}/100
Issues: ${report.problems.join("; ")}
Plan: ${report.fixes.join("; ")}

Sentence 1: What's missing today (simple words).
Sentence 2: Why AI search may not surface this store well.
Sentence 3: What we will improve (concrete actions only).`;

  return askGeminiWithTimeout(prompt, 45000);
}

export async function saveEntityProfile(shop, payload) {
  const prisma = (await import("../db.server.js")).default;
  return prisma.entityProfile.upsert({
    where: { shop },
    create: {
      shop,
      entityName: payload.entityName,
      specialization: payload.specialization,
      areaServed: payload.areaServed,
      entityHook: payload.entityHook,
      jsonLdDraft: payload.jsonLdDraft,
      aiVerdict: payload.aiVerdict,
    },
    update: {
      entityName: payload.entityName,
      specialization: payload.specialization,
      areaServed: payload.areaServed,
      entityHook: payload.entityHook,
      jsonLdDraft: payload.jsonLdDraft,
      aiVerdict: payload.aiVerdict,
      lastGenerated: new Date(),
    },
  });
}
