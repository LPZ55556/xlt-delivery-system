import { Controller, Get } from '@nestjs/common';

@Controller('auth')
export class AuthController {
  @Get()
  list() {
    return { module: 'auth', status: 'placeholder' };
  }
}
