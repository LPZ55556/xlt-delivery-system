CREATE TABLE "ReceiptTemplateSetting" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '销售单',
    "paperWidthMm" INTEGER NOT NULL DEFAULT 72,
    "footerText" TEXT NOT NULL DEFAULT '谢谢惠顾',
    "showMerchantName" BOOLEAN NOT NULL DEFAULT true,
    "showOrderNo" BOOLEAN NOT NULL DEFAULT true,
    "showSalesperson" BOOLEAN NOT NULL DEFAULT true,
    "showPrintTime" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ReceiptTemplateSetting_pkey" PRIMARY KEY ("id")
);
