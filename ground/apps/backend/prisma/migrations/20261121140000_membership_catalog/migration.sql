CREATE TABLE "membership_catalog" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "pro_price_yuan" INTEGER NOT NULL DEFAULT 0,
    "flagship_price_yuan" INTEGER NOT NULL DEFAULT 0,
    "standard_summary" TEXT NOT NULL DEFAULT '',
    "pro_summary" TEXT NOT NULL DEFAULT '',
    "flagship_summary" TEXT NOT NULL DEFAULT '',
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "membership_catalog_pkey" PRIMARY KEY ("id")
);
