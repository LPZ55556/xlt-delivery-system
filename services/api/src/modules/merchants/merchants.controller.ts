import { Controller, Get } from '@nestjs/common';

@Controller('merchants')
export class MerchantsController {
  @Get()
  list() {
    return { module: 'merchants', status: 'placeholder' };
  }
}
