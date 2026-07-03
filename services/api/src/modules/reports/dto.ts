export type ProductSalesRankingQuery = {
  range?: 'today' | '7d' | 'month';
  salespersonId?: string;
  limit?: string;
};

export type MerchantConsumptionRankingQuery = ProductSalesRankingQuery;
export type BusinessOverviewQuery = {
  range?: 'today' | '7d' | 'month';
  dateFrom?: string;
  dateTo?: string;
};
export type VerifyOverviewRequest = { costPricePassword?: string };
