import { Body, Controller, Get, Headers, Ip, Post } from '@nestjs/common';
import { CurrentUser, type RequestUser } from '../../common/auth/current-user.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import type { CheckInRequest, UploadTrackPointsRequest } from './dto';
import { LocationsService } from './locations.service';

@Controller('locations')
export class LocationsController {
  constructor(private readonly locations: LocationsService) {}

  @Roles('super_admin', 'admin', 'salesperson')
  @Post('check-in')
  checkIn(@Body() body: CheckInRequest, @CurrentUser() user: RequestUser, @Ip() ipAddress: string, @Headers('user-agent') deviceInfo?: string) {
    return this.locations.checkIn(body, user, { ipAddress, deviceInfo });
  }

  @Roles('super_admin', 'admin', 'salesperson')
  @Post('track-points')
  uploadTrackPoints(@Body() body: UploadTrackPointsRequest, @CurrentUser() user: RequestUser, @Ip() ipAddress: string, @Headers('user-agent') deviceInfo?: string) {
    return this.locations.uploadTrackPoints(body, user, { ipAddress, deviceInfo });
  }

  @Roles('super_admin', 'admin', 'salesperson')
  @Get('my-today-track')
  myTodayTrack(@CurrentUser() user: RequestUser) {
    return this.locations.myTodayTrack(user);
  }

  @Roles('super_admin', 'admin')
  @Get('users/latest')
  latestUsers(@CurrentUser() user: RequestUser) {
    return this.locations.latestUsers(user);
  }
}
