import { Controller, Get } from '@nestjs/common';

@Controller('locations')
export class LocationsController {
  @Get()
  list() {
    return { module: 'locations', status: 'placeholder' };
  }
}
