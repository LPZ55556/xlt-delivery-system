import { Body, Controller, Get, Headers, Ip, Post } from '@nestjs/common';
import { CurrentUser, type RequestUser } from '../../common/auth/current-user.decorator';
import { Public } from '../../common/auth/public.decorator';
import type { LoginRequest } from './dto';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  login(
    @Body() body: LoginRequest,
    @Ip() ipAddress: string,
    @Headers('user-agent') deviceInfo?: string,
  ) {
    return this.auth.login(body, { ipAddress, deviceInfo });
  }

  @Get('me')
  getMe(@CurrentUser() user: RequestUser) {
    return { user };
  }
}
