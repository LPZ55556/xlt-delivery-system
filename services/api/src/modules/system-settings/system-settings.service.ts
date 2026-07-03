import { ConflictException, ForbiddenException, Injectable, UnauthorizedException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import type { RequestUser } from '../../common/auth/current-user.decorator';
import { PrismaService } from '../../database/prisma.service';
import type { ReceiptTemplateRequest, ResetCostPricePasswordRequest } from './dto';

type RequestMeta = { ipAddress?: string; deviceInfo?: string };

const PASSWORD_MIN_LENGTH = 8;

@Injectable()
export class SystemSettingsService {
  constructor(private readonly prisma: PrismaService) {}



  async getReceiptTemplate() {
    const setting = await this.getOrCreateReceiptTemplate();
    return this.toReceiptTemplateResponse(setting);
  }

  async updateReceiptTemplate(input: ReceiptTemplateRequest, actor: RequestUser, requestMeta?: RequestMeta) {
    const existing = await this.getOrCreateReceiptTemplate();
    const data: Prisma.ReceiptTemplateSettingUpdateInput = {};
    if (input.title !== undefined) data.title = this.requiredString('title', input.title).slice(0, 60);
    if (input.footerText !== undefined) data.footerText = this.requiredString('footerText', input.footerText).slice(0, 80);
    if (input.paperWidthMm !== undefined) data.paperWidthMm = this.paperWidth(input.paperWidthMm);
    if (input.showMerchantName !== undefined) data.showMerchantName = Boolean(input.showMerchantName);
    if (input.showOrderNo !== undefined) data.showOrderNo = Boolean(input.showOrderNo);
    if (input.showSalesperson !== undefined) data.showSalesperson = Boolean(input.showSalesperson);
    if (input.showPrintTime !== undefined) data.showPrintTime = Boolean(input.showPrintTime);
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.receiptTemplateSetting.update({ where: { id: existing.id }, data });
      await tx.auditLog.create({ data: { actorId: actor.id, action: 'RECEIPT_TEMPLATE_UPDATED', targetType: 'system', targetId: row.id, ipAddress: requestMeta?.ipAddress, deviceInfo: requestMeta?.deviceInfo, success: true, metadata: { fields: Object.keys(data) } } });
      return row;
    });
    return this.toReceiptTemplateResponse(updated);
  }

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



  private async getOrCreateReceiptTemplate() {
    const existing = await this.prisma.receiptTemplateSetting.findFirst({ orderBy: { createdAt: 'asc' } });
    if (existing) return existing;
    return this.prisma.receiptTemplateSetting.create({ data: {} });
  }

  private paperWidth(value: string | number) {
    const width = Number(value);
    if (!Number.isInteger(width) || width < 40 || width > 120) throw new UnprocessableEntityException('paperWidthMm must be an integer between 40 and 120.');
    return width;
  }

  private toReceiptTemplateResponse(setting: { id: string; title: string; paperWidthMm: number; footerText: string; showMerchantName: boolean; showOrderNo: boolean; showSalesperson: boolean; showPrintTime: boolean; updatedAt: Date }) {
    return { id: setting.id, title: setting.title, paperWidthMm: setting.paperWidthMm, footerText: setting.footerText, showMerchantName: setting.showMerchantName, showOrderNo: setting.showOrderNo, showSalesperson: setting.showSalesperson, showPrintTime: setting.showPrintTime, updatedAt: setting.updatedAt.toISOString() };
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
