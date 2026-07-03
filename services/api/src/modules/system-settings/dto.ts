export type ResetCostPricePasswordRequest = {
  currentPassword?: string;
  newCostPricePassword?: string;
  newCostPricePasswordConfirm?: string;
};

export type ReceiptTemplateRequest = {
  title?: string;
  paperWidthMm?: number | string;
  footerText?: string;
  showMerchantName?: boolean;
  showOrderNo?: boolean;
  showSalesperson?: boolean;
  showPrintTime?: boolean;
};
