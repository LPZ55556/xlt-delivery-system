import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Controller('health')
export class HealthController {
  constructor(private readonly config: ConfigService) {}

  @Get()
  getHealth() {
    return {
      status: 'ok',
      service: 'xlt-api',
      env: this.config.get<string>('app.nodeEnv'),
      timestamp: new Date().toISOString(),
    };
  }
}
