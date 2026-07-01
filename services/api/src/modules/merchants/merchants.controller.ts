import { Body, Controller, Delete, Get, Headers, Ip, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser, type RequestUser } from '../../common/auth/current-user.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import type { CreateMerchantRequest, MerchantListQuery, UpdateMerchantRequest } from './dto';
import { MerchantsService } from './merchants.service';

@Controller('merchants')
export class MerchantsController {
  constructor(private readonly merchants: MerchantsService) {}

  @Roles('super_admin', 'admin', 'finance', 'warehouse', 'salesperson')
  @Get()
  list(@Query() query: MerchantListQuery) {
    return this.merchants.list(query);
  }

  @Roles('super_admin', 'admin', 'finance', 'warehouse', 'salesperson')
  @Get(':id')
  getById(@Param('id') id: string) {
    return this.merchants.getById(id);
  }

  @Roles('super_admin', 'admin')
  @Post()
  create(
    @Body() body: CreateMerchantRequest,
    @CurrentUser() user: RequestUser,
    @Ip() ipAddress: string,
    @Headers('user-agent') deviceInfo?: string,
  ) {
    return this.merchants.create(body, user, { ipAddress, deviceInfo });
  }

  @Roles('super_admin', 'admin')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() body: UpdateMerchantRequest,
    @CurrentUser() user: RequestUser,
    @Ip() ipAddress: string,
    @Headers('user-agent') deviceInfo?: string,
  ) {
    return this.merchants.update(id, body, user, { ipAddress, deviceInfo });
  }

  @Roles('super_admin', 'admin')
  @Delete(':id')
  disable(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Ip() ipAddress: string,
    @Headers('user-agent') deviceInfo?: string,
  ) {
    return this.merchants.disable(id, user, { ipAddress, deviceInfo });
  }
}
