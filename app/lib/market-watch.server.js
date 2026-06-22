import prisma from "../db.server.js";
import { serializeMarketContext } from "./markets.server.js";

export function fingerprintMarkets(marketContext) {
  if (!marketContext) return "";
  const codes = [...(marketContext.countryCodes ?? [])].sort().join(",");
  const langs = (marketContext.publishedLocales ?? []).map((l) => l.locale).sort().join(",");
  return `${codes}|${langs}|${marketContext.confirmed ? "1" : "0"}`;
}

export async function checkMarketsChanged(shop, marketContext) {
  const fp = fingerprintMarkets(marketContext);
  const row = await prisma.shopSettings.findUnique({ where: { shop } });
  const previous = row?.marketsFingerprint ?? null;

  if (!previous) {
    await prisma.shopSettings.upsert({
      where: { shop },
      create: { shop, marketsFingerprint: fp, targetMarketsJson: serializeMarketContext(marketContext) },
      update: { marketsFingerprint: fp },
    });
    return { changed: false, firstSeen: true };
  }

  const changed = previous !== fp;
  if (changed) {
    await prisma.shopSettings.update({
      where: { shop },
      data: { marketsFingerprint: fp, targetMarketsJson: serializeMarketContext(marketContext) },
    });
  }

  return { changed, previous, current: fp };
}
