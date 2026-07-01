import { Body, Controller, Get, Headers, Ip, Post } from '@nestjs/common';
import type { LoginRequest } from './dto';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  login(
    @Body() body: LoginRequest,
    @Ip() ipAddress: string,
    @Headers('user-agent') deviceInfo?: string,
  ) {
    return this.auth.login(body, { ipAddress, deviceInfo });
  }

  @Get('me')
  getMe(@Headers('authorization') authorization?: string) {
    return this.auth.getCurrentUser(authorization);
  }
}
