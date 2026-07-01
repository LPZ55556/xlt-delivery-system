import { Controller, Get } from '@nestjs/common';

@Controller('audit-logs')
export class AuditLogsController {
  @Get()
  list() {
    return { module: 'audit logs', status: 'placeholder' };
  }
}
