ALTER TABLE "ShopSettings" ADD COLUMN IF NOT EXISTS "uninstallRestorePreference" TEXT NOT NULL DEFAULT 'restore';
