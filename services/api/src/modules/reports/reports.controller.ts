import { Controller, Get, Query } from '@nestjs/common';
import { CurrentUser, type RequestUser } from '../../common/auth/current-user.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import type { ProductSalesRankingQuery } from './dto';
import { ReportsService } from './reports.service';

@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Roles('super_admin', 'admin', 'finance', 'warehouse', 'salesperson')
  @Get('product-sales-ranking')
  productSalesRanking(@Query() query: ProductSalesRankingQuery, @CurrentUser() user: RequestUser) {
    return this.reports.productSalesRanking(query, user);
  }
}
