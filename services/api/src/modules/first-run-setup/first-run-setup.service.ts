import { ConflictException, Injectable, UnprocessableEntityException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../database/prisma.service';
import type { FirstRunSetupRequest } from './dto';

const PASSWORD_MIN_LENGTH = 8;

@Injectable()
export class FirstRunSetupService {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async getStatus() {
    const enabled = this.config.get<boolean>('app.firstRunSetupEnabled', true);
    const [adminCount, completedState] = await Promise.all([
      this.prisma.user.count({ where: { role: 'super_admin' } }),
      this.prisma.firstRunSetupState.findFirst({ where: { completed: true }, orderBy: { completedAt: 'desc' } }),
    ]);
    const initialized = adminCount > 0 || Boolean(completedState);

    return {
      initialized,
      setupAvailable: enabled && !initialized,
    };
  }

  async initialize(input: FirstRunSetupRequest, requestMeta?: { ipAddress?: string; deviceInfo?: string }) {
    const status = await this.getStatus();
    if (!status.setupAvailable) {
      throw new ConflictException('First run setup is not available.');
    }

    const adminUsername = input.adminUsername?.trim();
    this.assertRequired('adminUsername', adminUsername);
    this.assertPassword('adminPassword', input.adminPassword, input.adminPasswordConfirm);
    this.assertPassword('costPricePassword', input.costPricePassword, input.costPricePasswordConfirm);

    const [adminPasswordHash, costPricePasswordHash] = await Promise.all([
      bcrypt.hash(input.adminPassword!, 12),
      bcrypt.hash(input.costPricePassword!, 12),
    ]);

    await this.prisma.$transaction(async (tx) => {
      const existingAdminCount = await tx.user.count({ where: { role: 'super_admin' } });
      const completedState = await tx.firstRunSetupState.findFirst({ where: { completed: true } });
      if (existingAdminCount > 0 || completedState) {
        throw new ConflictException('First run setup has already been completed.');
      }

      const admin = await tx.user.create({
        data: {
          username: adminUsername!,
          displayName: adminUsername!,
          passwordHash: adminPasswordHash,
          role: 'super_admin',
          enabled: true,
        },
      });

      await tx.firstRunSetupState.create({
        data: {
          completed: true,
          completedAt: new Date(),
          costPricePasswordHash,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: admin.id,
          action: 'FIRST_RUN_SETUP_COMPLETED',
          targetType: 'system',
          targetId: 'first-run-setup',
          ipAddress: requestMeta?.ipAddress,
          deviceInfo: requestMeta?.deviceInfo,
          success: true,
          metadata: { adminUsername },
        },
      });
    });

    return { initialized: true, setupAvailable: false };
  }

  private assertRequired(field: string, value?: string) {
    if (!value) {
      throw new UnprocessableEntityException(`${field} is required.`);
    }
  }

  private assertPassword(field: string, value?: string, confirm?: string) {
    this.assertRequired(field, value);
    if (value!.length < PASSWORD_MIN_LENGTH) {
      throw new UnprocessableEntityException(`${field} must be at least ${PASSWORD_MIN_LENGTH} characters.`);
    }
    if (value !== confirm) {
      throw new UnprocessableEntityException(`${field} confirmation does not match.`);
    }
  }
}
