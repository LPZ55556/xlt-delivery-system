import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma, type Merchant } from '@prisma/client';
import type { RequestUser } from '../../common/auth/current-user.decorator';
import { PrismaService } from '../../database/prisma.service';
import type { CreateMerchantRequest, MerchantListQuery, UpdateMerchantRequest } from './dto';

type RequestMeta = { ipAddress?: string; deviceInfo?: string };

const decimalCoordinatePattern = /^-?\d+(\.\d{1,7})?$/;

@Injectable()
export class MerchantsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: MerchantListQuery) {
    const page = this.parsePage(query.page);
    const pageSize = this.parsePageSize(query.pageSize);
    const search = query.search?.trim();
    const includeInactive = query.includeInactive === 'true';
    const where: Prisma.MerchantWhereInput = {
      ...(includeInactive ? {} : { isActive: true }),
      ...(search ? { name: { contains: search, mode: 'insensitive' } } : {}),
    };

    const [total, merchants] = await Promise.all([
      this.prisma.merchant.count({ where }),
      this.prisma.merchant.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      items: merchants.map((merchant) => this.toResponse(merchant)),
      total,
      page,
      pageSize,
    };
  }

  async getById(id: string) {
    return this.toResponse(await this.findMerchant(id));
  }

  async create(input: CreateMerchantRequest, actor: RequestUser, requestMeta?: RequestMeta) {
    const data = this.buildCreateData(input);
    const merchant = await this.prisma.merchant.create({ data });
    await this.writeAudit(actor, 'MERCHANT_CREATED', merchant.id, true, requestMeta, { name: merchant.name });
    return this.toResponse(merchant);
  }

  async update(id: string, input: UpdateMerchantRequest, actor: RequestUser, requestMeta?: RequestMeta) {
    await this.findMerchant(id);
    const data = this.buildUpdateData(input);
    const merchant = await this.prisma.merchant.update({ where: { id }, data });
    await this.writeAudit(actor, 'MERCHANT_UPDATED', merchant.id, true, requestMeta, { fields: Object.keys(data) });
    return this.toResponse(merchant);
  }

  async disable(id: string, actor: RequestUser, requestMeta?: RequestMeta) {
    await this.findMerchant(id);
    const merchant = await this.prisma.merchant.update({ where: { id }, data: { isActive: false } });
    await this.writeAudit(actor, 'MERCHANT_DISABLED', merchant.id, true, requestMeta);
    return this.toResponse(merchant);
  }

  private async findMerchant(id: string) {
    const merchant = await this.prisma.merchant.findUnique({ where: { id } });
    if (!merchant) throw new NotFoundException('Merchant not found.');
    return merchant;
  }

  private buildCreateData(input: CreateMerchantRequest) {
    return {
      name: this.requiredString('name', input.name),
      contactName: this.optionalString(input.contactName),
      phone: this.optionalString(input.phone),
      address: this.requiredString('address', input.address),
      latitude: this.optionalCoordinate('latitude', input.latitude),
      longitude: this.optionalCoordinate('longitude', input.longitude),
      area: this.optionalString(input.area),
      defaultSalespersonId: this.optionalString(input.defaultSalespersonId),
      remark: this.optionalString(input.remark),
      isActive: input.isActive ?? true,
    };
  }

  private buildUpdateData(input: UpdateMerchantRequest) {
    const data: Record<string, unknown> = {};
    if (input.name !== undefined) data.name = this.requiredString('name', input.name);
    if (input.contactName !== undefined) data.contactName = this.optionalString(input.contactName);
    if (input.phone !== undefined) data.phone = this.optionalString(input.phone);
    if (input.address !== undefined) data.address = this.requiredString('address', input.address);
    if (input.latitude !== undefined) data.latitude = this.optionalCoordinate('latitude', input.latitude);
    if (input.longitude !== undefined) data.longitude = this.optionalCoordinate('longitude', input.longitude);
    if (input.area !== undefined) data.area = this.optionalString(input.area);
    if (input.defaultSalespersonId !== undefined) data.defaultSalespersonId = this.optionalString(input.defaultSalespersonId);
    if (input.remark !== undefined) data.remark = this.optionalString(input.remark);
    if (input.isActive !== undefined) data.isActive = input.isActive;
    if (Object.keys(data).length === 0) throw new UnprocessableEntityException('No merchant fields to update.');
    return data;
  }

  private toResponse(merchant: Merchant) {
    return {
      id: merchant.id,
      name: merchant.name,
      contactName: merchant.contactName,
      phone: merchant.phone,
      address: merchant.address,
      latitude: merchant.latitude?.toString() ?? null,
      longitude: merchant.longitude?.toString() ?? null,
      area: merchant.area,
      defaultSalespersonId: merchant.defaultSalespersonId,
      remark: merchant.remark,
      isActive: merchant.isActive,
      createdAt: merchant.createdAt.toISOString(),
      updatedAt: merchant.updatedAt.toISOString(),
    };
  }

  private parsePage(value?: string) {
    const page = Number(value ?? 1);
    if (!Number.isInteger(page) || page < 1) throw new UnprocessableEntityException('page must be a positive integer.');
    return page;
  }

  private parsePageSize(value?: string) {
    const pageSize = Number(value ?? 20);
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
      throw new UnprocessableEntityException('pageSize must be an integer between 1 and 100.');
    }
    return pageSize;
  }

  private requiredString(field: string, value?: string) {
    const normalized = value?.trim();
    if (!normalized) throw new UnprocessableEntityException(`${field} is required.`);
    return normalized;
  }

  private optionalString(value?: string) {
    const normalized = value?.trim();
    return normalized || null;
  }

  private optionalCoordinate(field: string, value?: string) {
    if (value === undefined || value === '') return null;
    if (!decimalCoordinatePattern.test(value)) {
      throw new UnprocessableEntityException(`${field} must be a decimal string with up to 7 fraction digits.`);
    }
    return value;
  }

  private async writeAudit(actor: RequestUser, action: string, targetId: string, success: boolean, requestMeta?: RequestMeta, metadata?: Prisma.InputJsonObject) {
    await this.prisma.auditLog.create({
      data: {
        actorId: actor.id,
        action,
        targetType: 'merchant',
        targetId,
        ipAddress: requestMeta?.ipAddress,
        deviceInfo: requestMeta?.deviceInfo,
        success,
        metadata: metadata ?? Prisma.JsonNull,
      },
    });
  }
}
