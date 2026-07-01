import { Body, Controller, Get, Post } from '@nestjs/common';

@Controller('first-run-setup')
export class FirstRunSetupController {
  @Get('status')
  getStatus() {
    return { initialized: false, setupAvailable: true, note: 'Placeholder. Later this will check whether an admin account already exists.' };
  }

  @Post()
  initialize(@Body() _body: unknown) {
    return { accepted: false, note: 'Placeholder only. Later this will hash passwords, create the first admin, store the cost price password hash, and close setup.' };
  }
}
