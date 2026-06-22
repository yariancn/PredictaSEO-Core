-- Product tier packs + Search Console + apply impact tracking
ALTER TABLE "ShopBilling" ADD COLUMN IF NOT EXISTS "extraProductPacks" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ShopSettings" ADD COLUMN IF NOT EXISTS "marketsFingerprint" TEXT;
ALTER TABLE "ShopSettings" ADD COLUMN IF NOT EXISTS "lastApplyReportJson" TEXT;

CREATE TABLE IF NOT EXISTS "SearchConsoleConnection" (
  "shop" TEXT NOT NULL PRIMARY KEY,
  "accessToken" TEXT NOT NULL,
  "refreshToken" TEXT,
  "expiresAt" TIMESTAMP(3),
  "siteUrl" TEXT,
  "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
