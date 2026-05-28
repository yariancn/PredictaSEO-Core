-- Apply quota: monthly auto-apply tracking + extra apply credits
ALTER TABLE "ShopBilling" ADD COLUMN IF NOT EXISTS "extraApplyCredits" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "ApplyRun" (
    "id" SERIAL NOT NULL,
    "shop" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "batchId" TEXT,
    "status" TEXT NOT NULL,
    "note" TEXT,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ApplyRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ApplyRun_shop_period_idx" ON "ApplyRun"("shop", "period");
CREATE INDEX IF NOT EXISTS "ApplyRun_shop_kind_idx" ON "ApplyRun"("shop", "kind");

CREATE TABLE IF NOT EXISTS "ProcessedBillingCharge" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProcessedBillingCharge_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ProcessedBillingCharge_shop_kind_idx" ON "ProcessedBillingCharge"("shop", "kind");
