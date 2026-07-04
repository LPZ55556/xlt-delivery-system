export type ProductSalesRankingQuery = {
  range?: string;
  salespersonId?: string;
  limit?: string;
};

export type MerchantConsumptionRankingQuery = ProductSalesRankingQuery;
export type BusinessOverviewQuery = {
  range?: string;
  dateFrom?: string;
  dateTo?: string;
};
export type VerifyOverviewRequest = { costPricePassword?: string };
