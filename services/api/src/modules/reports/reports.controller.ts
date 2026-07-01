import { Controller, Get } from '@nestjs/common';

@Controller('reports')
export class ReportsController {
  @Get()
  list() {
    return { module: 'reports', status: 'placeholder' };
  }
}
