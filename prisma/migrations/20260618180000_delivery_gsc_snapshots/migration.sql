-- Delivery status + GSC before/after snapshots
ALTER TABLE "ShopSettings" ADD COLUMN IF NOT EXISTS "deliveryStatusJson" TEXT;

ALTER TABLE "SearchConsoleConnection" ADD COLUMN IF NOT EXISTS "baselineImpressions" INTEGER;
ALTER TABLE "SearchConsoleConnection" ADD COLUMN IF NOT EXISTS "baselineClicks" INTEGER;
ALTER TABLE "SearchConsoleConnection" ADD COLUMN IF NOT EXISTS "baselineCapturedAt" TIMESTAMP(3);
ALTER TABLE "SearchConsoleConnection" ADD COLUMN IF NOT EXISTS "latestImpressions" INTEGER;
ALTER TABLE "SearchConsoleConnection" ADD COLUMN IF NOT EXISTS "latestClicks" INTEGER;
ALTER TABLE "SearchConsoleConnection" ADD COLUMN IF NOT EXISTS "latestCapturedAt" TIMESTAMP(3);
ALTER TABLE "SearchConsoleConnection" ADD COLUMN IF NOT EXISTS "applyMarkerAt" TIMESTAMP(3);
