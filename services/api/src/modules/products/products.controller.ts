import { Controller, Get } from '@nestjs/common';

@Controller('products')
export class ProductsController {
  @Get()
  list() {
    return { module: 'products', status: 'placeholder' };
  }
}
