export type ProductSalesRankingQuery = {
  range?: 'today' | '7d' | 'month';
  salespersonId?: string;
  limit?: string;
};
