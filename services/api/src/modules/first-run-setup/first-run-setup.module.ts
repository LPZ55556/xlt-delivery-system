import { Module } from '@nestjs/common';
import { FirstRunSetupController } from './first-run-setup.controller';

@Module({ controllers: [FirstRunSetupController] })
export class FirstRunSetupModule {}
