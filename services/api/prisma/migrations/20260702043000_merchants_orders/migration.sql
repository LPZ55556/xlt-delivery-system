-- Alter Merchant for management API.
ALTER TABLE "Merchant" RENAME COLUMN "region" TO "area";
ALTER TABLE "Merchant" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;

-- Alter Order for voiding and optional app-submitted metadata.
ALTER TABLE "Order" ADD COLUMN "remark" TEXT;
ALTER TABLE "Order" ADD COLUMN "voidedAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN "voidReason" TEXT;

-- Preserve product barcode on historical order items.
ALTER TABLE "OrderItem" ADD COLUMN "productBarcodeSnapshot" TEXT NOT NULL DEFAULT '';
