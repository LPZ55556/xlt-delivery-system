export type ProductSalesRankingQuery = {
  range?: 'today' | '7d' | 'month' | '6m' | '1y' | 'all';
  salespersonId?: string;
  limit?: string;
};

export type MerchantConsumptionRankingQuery = ProductSalesRankingQuery;
export type BusinessOverviewQuery = {
  range?: 'today' | '7d' | 'month' | '6m' | '1y' | 'all';
  dateFrom?: string;
  dateTo?: string;
};
export type VerifyOverviewRequest = { costPricePassword?: string };
