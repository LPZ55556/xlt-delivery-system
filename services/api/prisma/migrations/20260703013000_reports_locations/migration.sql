CREATE TABLE "LocationTrackPoint" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "latitude" DECIMAL(10,7) NOT NULL,
    "longitude" DECIMAL(10,7) NOT NULL,
    "accuracy" DECIMAL(10,2),
    "speed" DECIMAL(10,2),
    "recordedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LocationTrackPoint_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MerchantCheckIn" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "latitude" DECIMAL(10,7) NOT NULL,
    "longitude" DECIMAL(10,7) NOT NULL,
    "address" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MerchantCheckIn_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UserLatestLocation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "latitude" DECIMAL(10,7) NOT NULL,
    "longitude" DECIMAL(10,7) NOT NULL,
    "address" TEXT,
    "accuracy" DECIMAL(10,2),
    "speed" DECIMAL(10,2),
    "recordedAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "UserLatestLocation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LocationTrackPoint_userId_recordedAt_idx" ON "LocationTrackPoint"("userId", "recordedAt");
CREATE INDEX "MerchantCheckIn_userId_createdAt_idx" ON "MerchantCheckIn"("userId", "createdAt");
CREATE INDEX "MerchantCheckIn_merchantId_createdAt_idx" ON "MerchantCheckIn"("merchantId", "createdAt");
CREATE UNIQUE INDEX "UserLatestLocation_userId_key" ON "UserLatestLocation"("userId");
