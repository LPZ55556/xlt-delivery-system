import { Body, Controller, Get, Headers, Ip, Post, Query } from '@nestjs/common';
import { CurrentUser, type RequestUser } from '../../common/auth/current-user.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import type { BusinessOverviewQuery, MerchantConsumptionRankingQuery, ProductSalesRankingQuery, VerifyOverviewRequest } from './dto';
import { ReportsService } from './reports.service';

@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Roles('super_admin', 'admin', 'finance', 'warehouse', 'salesperson')
  @Get('product-sales-ranking')
  productSalesRanking(@Query() query: ProductSalesRankingQuery, @CurrentUser() user: RequestUser) {
    return this.reports.productSalesRanking(query, user);
  }

  @Roles('super_admin', 'admin', 'finance', 'salesperson')
  @Get('merchant-consumption-ranking')
  merchantConsumptionRanking(@Query() query: MerchantConsumptionRankingQuery, @CurrentUser() user: RequestUser) {
    return this.reports.merchantConsumptionRanking(query, user);
  }

  @Roles('super_admin', 'admin', 'finance')
  @Post('overview/verify')
  verifyOverview(@Body() body: VerifyOverviewRequest, @CurrentUser() user: RequestUser, @Ip() ipAddress: string, @Headers('user-agent') deviceInfo?: string) {
    return this.reports.verifyOverviewPassword(body.costPricePassword, user, { ipAddress, deviceInfo });
  }

  @Roles('super_admin', 'admin', 'finance')
  @Get('business-overview')
  businessOverview(@Query() query: BusinessOverviewQuery, @Headers('x-cost-price-password') costPricePassword: string | undefined, @CurrentUser() user: RequestUser, @Ip() ipAddress: string, @Headers('user-agent') deviceInfo?: string) {
    return this.reports.businessOverview(query, costPricePassword, user, { ipAddress, deviceInfo });
  }
}
