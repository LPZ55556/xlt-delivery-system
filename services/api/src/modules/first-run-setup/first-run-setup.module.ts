import { Module } from '@nestjs/common';
import { FirstRunSetupController } from './first-run-setup.controller';
import { FirstRunSetupService } from './first-run-setup.service';

@Module({
  controllers: [FirstRunSetupController],
  providers: [FirstRunSetupService],
})
export class FirstRunSetupModule {}
