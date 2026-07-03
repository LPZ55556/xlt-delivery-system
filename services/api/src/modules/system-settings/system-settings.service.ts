import { ConflictException, ForbiddenException, Injectable, UnauthorizedException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import type { RequestUser } from '../../common/auth/current-user.decorator';
import { PrismaService } from '../../database/prisma.service';
import type { ResetCostPricePasswordRequest } from './dto';

type RequestMeta = { ipAddress?: string; deviceInfo?: string };

const PASSWORD_MIN_LENGTH = 8;

@Injectable()
export class SystemSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async resetCostPricePassword(input: ResetCostPricePasswordRequest, actor: RequestUser, requestMeta?: RequestMeta) {
    const currentPassword = this.requiredString('currentPassword', input.currentPassword);
    const nextPassword = this.requiredPassword('newCostPricePassword', input.newCostPricePassword);
    if (nextPassword !== input.newCostPricePasswordConfirm) {
      throw new UnprocessableEntityException('newCostPricePassword confirmation does not match.');
    }

    const actorRecord = await this.prisma.user.findUnique({ where: { id: actor.id } });
    if (!actorRecord || !actorRecord.enabled) throw new UnauthorizedException('User is not available.');

    const currentPasswordMatches = await bcrypt.compare(currentPassword, actorRecord.passwordHash);
    if (!currentPasswordMatches) {
      await this.writeAudit(actor, false, requestMeta, { reason: 'current_password' });
      throw new ForbiddenException('Current password is invalid.');
    }

    const setupState = await this.prisma.firstRunSetupState.findFirst({ where: { completed: true }, orderBy: { completedAt: 'desc' } });
    if (!setupState) throw new ConflictException('Cost price password is not configured.');

    const costPricePasswordHash = await bcrypt.hash(nextPassword, 12);
    await this.prisma.$transaction(async (tx) => {
      await tx.firstRunSetupState.update({ where: { id: setupState.id }, data: { costPricePasswordHash } });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: 'COST_PRICE_PASSWORD_RESET',
          targetType: 'system',
          targetId: 'cost-price-password',
          ipAddress: requestMeta?.ipAddress,
          deviceInfo: requestMeta?.deviceInfo,
          success: true,
          metadata: { actorUsername: actor.username },
        },
      });
    });

    return { updated: true };
  }

  private requiredString(field: string, value?: string) {
    const normalized = value?.trim();
    if (!normalized) throw new UnprocessableEntityException(`${field} is required.`);
    return normalized;
  }

  private requiredPassword(field: string, value?: string) {
    const password = this.requiredString(field, value);
    if (password.length < PASSWORD_MIN_LENGTH) throw new UnprocessableEntityException(`${field} must be at least ${PASSWORD_MIN_LENGTH} characters.`);
    return password;
  }

  private async writeAudit(actor: RequestUser, success: boolean, requestMeta?: RequestMeta, metadata?: Prisma.InputJsonObject) {
    await this.prisma.auditLog.create({
      data: {
        actorId: actor.id,
        action: 'COST_PRICE_PASSWORD_RESET',
        targetType: 'system',
        targetId: 'cost-price-password',
        ipAddress: requestMeta?.ipAddress,
        deviceInfo: requestMeta?.deviceInfo,
        success,
        metadata: metadata ?? Prisma.JsonNull,
      },
    });
  }
}
