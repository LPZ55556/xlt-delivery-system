import { Body, Controller, Delete, Get, Headers, Ip, Param, Patch, Post } from '@nestjs/common';
import { CurrentUser, type RequestUser } from '../../common/auth/current-user.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import type { CreateProductRequest, UpdateProductRequest, VerifyCostPriceRequest } from './dto';
import { ProductsService } from './products.service';

@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  list() {
    return this.products.list();
  }

  @Get('categories')
  categories() {
    return this.products.categories();
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.products.getById(id);
  }

  @Roles('super_admin', 'admin', 'warehouse')
  @Post()
  create(
    @Body() body: CreateProductRequest,
    @CurrentUser() user: RequestUser,
    @Ip() ipAddress: string,
    @Headers('user-agent') deviceInfo?: string,
  ) {
    return this.products.create(body, user, { ipAddress, deviceInfo });
  }

  @Roles('super_admin', 'admin', 'warehouse')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() body: UpdateProductRequest,
    @CurrentUser() user: RequestUser,
    @Ip() ipAddress: string,
    @Headers('user-agent') deviceInfo?: string,
  ) {
    return this.products.update(id, body, user, { ipAddress, deviceInfo });
  }

  @Roles('super_admin', 'admin', 'warehouse')
  @Delete(':id')
  disable(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Ip() ipAddress: string,
    @Headers('user-agent') deviceInfo?: string,
  ) {
    return this.products.disable(id, user, { ipAddress, deviceInfo });
  }

  @Roles('super_admin', 'admin', 'finance')
  @Post(':id/cost-price-verification')
  verifyCostPrice(
    @Param('id') id: string,
    @Body() body: VerifyCostPriceRequest,
    @CurrentUser() user: RequestUser,
    @Ip() ipAddress: string,
    @Headers('user-agent') deviceInfo?: string,
  ) {
    return this.products.verifyCostPrice(id, body, user, { ipAddress, deviceInfo });
  }
}
