ALTER TABLE "OrderItem" ADD COLUMN "costPriceSnapshot" DECIMAL(12,2);
ALTER TABLE "MerchantCheckIn" ALTER COLUMN "latitude" DROP NOT NULL;
ALTER TABLE "MerchantCheckIn" ALTER COLUMN "longitude" DROP NOT NULL;
