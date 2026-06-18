import { askGeminiWithTimeout } from "./gemini.server.js";
import { detectGeoMismatch } from "./markets.server.js";

function renderPattern(pattern, vars) {
  return pattern.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? "");
}

function stripHtml(html) {
  return (html ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function categoryLabel(categoryName, languageCode) {
  const lower = categoryName.toLowerCase();
  if (languageCode.startsWith("es")) return lower;
  return lower;
}

/**
 * Market-aware SEO proposal (template path — always geography-correct).
 */
export function buildSeoProposal(product, shopName, categoryName, marketContext) {
  const lang = marketContext?.languageCode ?? "en";
  const region = marketContext?.regionLabelShort ?? marketContext?.regionLabel ?? "your region";
  const vars = {
    product_title: product.title,
    category: categoryName,
    category_lower: categoryLabel(categoryName, lang),
    shop_name: shopName,
    region,
    region_short: marketContext?.regionLabelShort ?? region,
  };

  let titlePattern;
  let descPattern;

  if (lang.startsWith("es")) {
    titlePattern = "{product_title} | {category} — {region_short}";
    descPattern =
      "Compra {product_title} en {shop_name}. {category} con envío a {region}. Calidad y atención en tu tienda.";
  } else if (lang.startsWith("fr")) {
    titlePattern = "{product_title} | {category} — {region_short}";
    descPattern =
      "Achetez {product_title} chez {shop_name}. {category} livré en {region}. Qualité pour votre boutique.";
  } else if (lang.startsWith("pt")) {
    titlePattern = "{product_title} | {category} — {region_short}";
    descPattern =
      "Compre {product_title} na {shop_name}. {category} com entrega em {region}. Qualidade garantida.";
  } else {
    titlePattern = "{product_title} | {category} — {region_short}";
    descPattern =
      "Shop {product_title} at {shop_name}. Premium {category_lower} for {region}. {shop_name} ships to your market.";
  }

  const shipping = marketContext?.shippingPhrase ?? "";
  const seoTitle = renderPattern(titlePattern, vars).slice(0, 70);
  let seoDescription = renderPattern(descPattern, vars).slice(0, 155);
  if (shipping && seoDescription.length < 140) {
    seoDescription = `${seoDescription} ${shipping}`.slice(0, 160);
  }

  return { seoTitle, seoDescription };
}

export function buildProductDescriptionHtml(product, shopName, marketContext) {
  const title = product.title?.trim() || "Product";
  const vendor = product.vendor?.trim();
  const type = product.productType?.trim();
  const tags = (product.tags ?? []).slice(0, 5).join(", ");
  const region = marketContext?.regionLabel ?? "your markets";
  const lang = marketContext?.languageCode ?? "en";

  let intro;
  if (lang.startsWith("es")) {
    intro = vendor
      ? `${title} de ${vendor}${type ? ` — ${type}` : ""}. Disponible en ${region}.`
      : `${title}${type ? ` — ${type}` : ""}. Disponible en ${region}.`;
  } else {
    intro = vendor
      ? `${title} from ${vendor}${type ? ` — ${type}` : ""}. Available across ${region}.`
      : `${title}${type ? ` — ${type}` : ""}. Available across ${region}.`;
  }

  const bullets = [];
  if (type) bullets.push(lang.startsWith("es") ? `Categoría: ${type}` : `Category: ${type}`);
  if (tags) bullets.push(lang.startsWith("es") ? `Etiquetas: ${tags}` : `Tags: ${tags}`);
  bullets.push(
    lang.startsWith("es") ? `Disponible en ${shopName}` : `Available at ${shopName}`,
  );
  if (marketContext?.shippingPhrase) bullets.push(marketContext.shippingPhrase);

  const body = stripHtml(product.descriptionHtml ?? product.description);
  const existing = body.length > 40 ? `<p>${body.slice(0, 500)}</p>` : "";

  const closing = lang.startsWith("es")
    ? `<p>Compra con confianza en ${shopName}.</p>`
    : `<p>Shop with confidence at ${shopName}.</p>`;

  return `<p>${intro}</p>
${existing}
<ul>${bullets.map((b) => `<li>${b}</li>`).join("")}</ul>
${closing}`;
}

export async function buildSeoProposalWithAi(product, shopName, categoryName, marketContext) {
  const lang = marketContext?.languageName ?? "English";
  const region = marketContext?.regionLabel ?? "configured markets";
  const prompt = `You write Shopify product SEO for AI search visibility. Reply in ${lang} only.

Store: ${shopName}
Product: ${product.title}
Category: ${categoryName}
Target markets: ${region}
Country codes: ${(marketContext?.countryCodes ?? []).join(", ") || "not specified"}

Return EXACTLY two lines:
LINE1: SEO title (max 70 characters, include product name and region relevance)
LINE2: SEO meta description (max 160 characters, mention shipping to target markets, no hype)

Rules:
- Do NOT mention US, Canada, or countries outside the target markets list unless they are listed.
- Plain merchant-friendly language. No markdown.`;

  const raw = await askGeminiWithTimeout(prompt, 35000);
  const lines = raw.split("\n").map((l) => l.replace(/^LINE\d:\s*/i, "").trim()).filter(Boolean);
  const seoTitle = (lines[0] ?? buildSeoProposal(product, shopName, categoryName, marketContext).seoTitle).slice(
    0,
    70,
  );
  const seoDescription = (
    lines[1] ?? buildSeoProposal(product, shopName, categoryName, marketContext).seoDescription
  ).slice(0, 160);

  if (detectGeoMismatch(`${seoTitle} ${seoDescription}`, marketContext?.countryCodes ?? [])) {
    return buildSeoProposal(product, shopName, categoryName, marketContext);
  }

  return { seoTitle, seoDescription, aiGenerated: true };
}

export async function buildSeoForProduct(product, shopName, categoryName, marketContext, { useAi = false } = {}) {
  if (useAi && process.env.GEMINI_API_KEY) {
    try {
      return await buildSeoProposalWithAi(product, shopName, categoryName, marketContext);
    } catch {
      return buildSeoProposal(product, shopName, categoryName, marketContext);
    }
  }
  return buildSeoProposal(product, shopName, categoryName, marketContext);
}
