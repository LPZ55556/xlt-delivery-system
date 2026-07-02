import { Body, Controller, Get, Headers, Ip, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser, type RequestUser } from '../../common/auth/current-user.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import type { CreateUserRequest, ResetUserPasswordRequest, UpdateUserRequest, UserListQuery } from './dto';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  me(@CurrentUser() user: RequestUser) {
    return this.users.getMe(user);
  }

  @Roles('super_admin', 'admin')
  @Get()
  list(@Query() query: UserListQuery) {
    return this.users.list(query);
  }

  @Roles('super_admin', 'admin')
  @Get(':id')
  getById(@Param('id') id: string) {
    return this.users.getById(id);
  }

  @Roles('super_admin', 'admin')
  @Post()
  create(
    @Body() body: CreateUserRequest,
    @CurrentUser() user: RequestUser,
    @Ip() ipAddress: string,
    @Headers('user-agent') deviceInfo?: string,
  ) {
    return this.users.create(body, user, { ipAddress, deviceInfo });
  }

  @Roles('super_admin', 'admin')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() body: UpdateUserRequest,
    @CurrentUser() user: RequestUser,
    @Ip() ipAddress: string,
    @Headers('user-agent') deviceInfo?: string,
  ) {
    return this.users.update(id, body, user, { ipAddress, deviceInfo });
  }

  @Roles('super_admin', 'admin')
  @Patch(':id/password')
  resetPassword(
    @Param('id') id: string,
    @Body() body: ResetUserPasswordRequest,
    @CurrentUser() user: RequestUser,
    @Ip() ipAddress: string,
    @Headers('user-agent') deviceInfo?: string,
  ) {
    return this.users.resetPassword(id, body, user, { ipAddress, deviceInfo });
  }

  @Roles('super_admin', 'admin')
  @Patch(':id/disable')
  disable(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Ip() ipAddress: string,
    @Headers('user-agent') deviceInfo?: string,
  ) {
    return this.users.disable(id, user, { ipAddress, deviceInfo });
  }

  @Roles('super_admin', 'admin')
  @Patch(':id/enable')
  enable(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Ip() ipAddress: string,
    @Headers('user-agent') deviceInfo?: string,
  ) {
    return this.users.enable(id, user, { ipAddress, deviceInfo });
  }
}
