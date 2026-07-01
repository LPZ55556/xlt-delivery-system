import { Body, Controller, Get, Ip, Post, Headers } from '@nestjs/common';
import type { FirstRunSetupRequest } from './dto';
import { FirstRunSetupService } from './first-run-setup.service';

@Controller('first-run-setup')
export class FirstRunSetupController {
  constructor(private readonly service: FirstRunSetupService) {}

  @Get('status')
  getStatus() {
    return this.service.getStatus();
  }

  @Post()
  initialize(
    @Body() body: FirstRunSetupRequest,
    @Ip() ipAddress: string,
    @Headers('user-agent') deviceInfo?: string,
  ) {
    return this.service.initialize(body, { ipAddress, deviceInfo });
  }
}
