import { Body, Controller, Get, Headers, Ip, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser, type RequestUser } from '../../common/auth/current-user.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import type { CreateOrderRequest, OrderListQuery, VoidOrderRequest } from './dto';
import { OrdersService } from './orders.service';

@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Roles('super_admin', 'admin', 'salesperson')
  @Post()
  create(
    @Body() body: CreateOrderRequest,
    @CurrentUser() user: RequestUser,
    @Ip() ipAddress: string,
    @Headers('user-agent') deviceInfo?: string,
  ) {
    return this.orders.create(body, user, { ipAddress, deviceInfo });
  }

  @Roles('super_admin', 'admin', 'finance', 'salesperson')
  @Get()
  list(@Query() query: OrderListQuery, @CurrentUser() user: RequestUser) {
    return this.orders.list(query, user);
  }

  @Roles('super_admin', 'admin', 'finance', 'salesperson')
  @Get(':id')
  getById(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.orders.getById(id, user);
  }

  @Roles('super_admin', 'admin', 'finance', 'salesperson')
  @Get(':id/receipt')
  getReceipt(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.orders.getReceipt(id, user);
  }

  @Roles('super_admin', 'admin')
  @Patch(':id/void')
  voidOrder(
    @Param('id') id: string,
    @Body() body: VoidOrderRequest,
    @CurrentUser() user: RequestUser,
    @Ip() ipAddress: string,
    @Headers('user-agent') deviceInfo?: string,
  ) {
    return this.orders.voidOrder(id, body, user, { ipAddress, deviceInfo });
  }
}
