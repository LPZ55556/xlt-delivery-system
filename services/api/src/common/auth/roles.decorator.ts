import { SetMetadata } from '@nestjs/common';
import { REQUIRED_ROLES } from './auth.constants';

export const Roles = (...roles: string[]) => SetMetadata(REQUIRED_ROLES, roles);
