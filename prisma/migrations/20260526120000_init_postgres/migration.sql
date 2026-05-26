-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" TIMESTAMP(3),
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,
    "emailVerified" BOOLEAN DEFAULT false,
    "refreshToken" TEXT,
    "refreshTokenExpires" TIMESTAMP(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopSettings" (
    "id" SERIAL NOT NULL,
    "shop" TEXT NOT NULL,
    "specialization" TEXT,
    "manufacturing" TEXT,
    "customization" TEXT,
    "lastAiAnalysis" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShopSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EntityProfile" (
    "id" SERIAL NOT NULL,
    "shop" TEXT NOT NULL,
    "entityName" TEXT,
    "specialization" TEXT,
    "areaServed" TEXT,
    "entityHook" TEXT,
    "jsonLdDraft" TEXT,
    "aiVerdict" TEXT,
    "schemaActive" BOOLEAN NOT NULL DEFAULT false,
    "schemaThemeId" TEXT,
    "lastGenerated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EntityProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OptimizationSnapshot" (
    "id" SERIAL NOT NULL,
    "shop" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "originalValue" TEXT,
    "optimizedValue" TEXT,
    "batchId" TEXT,
    "appliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OptimizationSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopBilling" (
    "shop" TEXT NOT NULL,
    "setupPaid" BOOLEAN NOT NULL DEFAULT false,
    "setupPaidAt" TIMESTAMP(3),
    "subscriptionActive" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopBilling_pkey" PRIMARY KEY ("shop")
);

-- CreateIndex
CREATE UNIQUE INDEX "ShopSettings_shop_key" ON "ShopSettings"("shop");

-- CreateIndex
CREATE UNIQUE INDEX "EntityProfile_shop_key" ON "EntityProfile"("shop");

-- CreateIndex
CREATE INDEX "OptimizationSnapshot_shop_batchId_idx" ON "OptimizationSnapshot"("shop", "batchId");

-- CreateIndex
CREATE INDEX "OptimizationSnapshot_shop_resourceType_resourceId_idx" ON "OptimizationSnapshot"("shop", "resourceType", "resourceId");
