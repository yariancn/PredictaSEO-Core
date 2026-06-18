import prisma from "../db.server.js";
import { parseStoredMarketContext, serializeMarketContext } from "./markets.server.js";

export async function getShopMarketSettings(shop) {
  try {
    const settings = await prisma.shopSettings.findUnique({ where: { shop } });
    if (!settings?.targetMarketsJson) {
      return { countryCodes: [], confirmed: Boolean(settings?.marketsConfirmed) };
    }
    const parsed = parseStoredMarketContext(settings.targetMarketsJson);
    return {
      countryCodes: parsed?.countryCodes ?? [],
      confirmed: Boolean(parsed?.confirmed ?? settings?.marketsConfirmed),
    };
  } catch {
    return { countryCodes: [], confirmed: false };
  }
}

export async function saveShopMarketConfirmation(shop, marketContext) {
  const payload = serializeMarketContext({
    countryCodes: marketContext.countryCodes,
    confirmed: true,
    regionLabel: marketContext.regionLabel,
  });
  return prisma.shopSettings.upsert({
    where: { shop },
    create: {
      shop,
      targetMarketsJson: payload,
      marketsConfirmed: true,
    },
    update: {
      targetMarketsJson: payload,
      marketsConfirmed: true,
    },
  });
}
