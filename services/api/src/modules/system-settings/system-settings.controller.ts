import { Body, Controller, Headers, Ip, Patch } from '@nestjs/common';
import { CurrentUser, type RequestUser } from '../../common/auth/current-user.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import type { ResetCostPricePasswordRequest } from './dto';
import { SystemSettingsService } from './system-settings.service';

@Controller('system-settings')
export class SystemSettingsController {
  constructor(private readonly settings: SystemSettingsService) {}

  @Roles('super_admin')
  @Patch('cost-price-password')
  resetCostPricePassword(
    @Body() body: ResetCostPricePasswordRequest,
    @CurrentUser() user: RequestUser,
    @Ip() ipAddress: string,
    @Headers('user-agent') deviceInfo?: string,
  ) {
    return this.settings.resetCostPricePassword(body, user, { ipAddress, deviceInfo });
  }
}
