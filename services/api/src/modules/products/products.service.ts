import { ConflictException, ForbiddenException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma, type Product } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { RequestUser } from '../../common/auth/current-user.decorator';
import { PrismaService } from '../../database/prisma.service';
import type { CreateProductRequest, UpdateProductRequest, VerifyCostPriceRequest } from './dto';

type RequestMeta = { ipAddress?: string; deviceInfo?: string };

type ProductRecord = Product;


const moneyPattern = /^\d+(\.\d{1,2})?$/;
const costPriceRoles = new Set(['super_admin', 'admin', 'finance']);

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    const products = await this.prisma.product.findMany({ orderBy: { createdAt: 'desc' } });
    return { items: products.map((product) => this.toPublicProduct(product)) };
  }

  async getById(id: string) {
    const product = await this.findProduct(id);
    return this.toPublicProduct(product);
  }

  async categories() {
    const rows = await this.prisma.product.findMany({
      where: { category: { not: null } },
      select: { category: true },
      orderBy: { category: 'asc' },
    });
    const names = Array.from(new Set(rows.map((row) => row.category?.trim()).filter((value): value is string => Boolean(value))));
    return { items: names.map((name) => ({ name })) };
  }

  async create(input: CreateProductRequest, actor: RequestUser, requestMeta?: RequestMeta) {
    const data = this.buildCreateData(input);
    try {
      const product = await this.prisma.product.create({ data });
      await this.writeAudit(actor, 'PRODUCT_CREATED', product.id, true, requestMeta, { barcode: product.barcode });
      return this.toPublicProduct(product);
    } catch (error) {
      if (this.isUniqueError(error)) {
        throw new ConflictException('Product barcode already exists.');
      }
      throw error;
    }
  }

  async update(id: string, input: UpdateProductRequest, actor: RequestUser, requestMeta?: RequestMeta) {
    await this.findProduct(id);
    const data = this.buildUpdateData(input);
    try {
      const product = await this.prisma.product.update({ where: { id }, data });
      await this.writeAudit(actor, 'PRODUCT_UPDATED', product.id, true, requestMeta, { fields: Object.keys(data) });
      return this.toPublicProduct(product);
    } catch (error) {
      if (this.isUniqueError(error)) {
        throw new ConflictException('Product barcode already exists.');
      }
      throw error;
    }
  }

  async disable(id: string, actor: RequestUser, requestMeta?: RequestMeta) {
    await this.findProduct(id);
    const product = await this.prisma.product.update({ where: { id }, data: { enabled: false } });
    await this.writeAudit(actor, 'PRODUCT_DISABLED', product.id, true, requestMeta);
    return this.toPublicProduct(product);
  }

  async verifyCostPrice(id: string, input: VerifyCostPriceRequest, actor: RequestUser, requestMeta?: RequestMeta) {
    if (!costPriceRoles.has(actor.role)) {
      await this.writeAudit(actor, 'VIEW_PRODUCT_COST_PRICE_DENIED', id, false, requestMeta, { reason: 'role' });
      throw new ForbiddenException('Insufficient role to view cost price.');
    }

    const product = await this.findProduct(id);
    const setupState = await this.prisma.firstRunSetupState.findFirst({ where: { completed: true }, orderBy: { completedAt: 'desc' } });
    if (!setupState?.costPricePasswordHash) {
      await this.writeAudit(actor, 'VIEW_PRODUCT_COST_PRICE_DENIED', id, false, requestMeta, { reason: 'cost_price_password_missing' });
      throw new ForbiddenException('Cost price password is not configured.');
    }

    const passwordMatches = await bcrypt.compare(input.costPricePassword ?? '', setupState.costPricePasswordHash);
    if (!passwordMatches) {
      await this.writeAudit(actor, 'VIEW_PRODUCT_COST_PRICE_DENIED', id, false, requestMeta, { reason: 'password' });
      throw new ForbiddenException('Cost price password is invalid.');
    }

    await this.writeAudit(actor, 'VIEW_PRODUCT_COST_PRICE_SUCCEEDED', id, true, requestMeta);
    return { productId: product.id, costPrice: product.costPrice?.toFixed(2) ?? null };
  }

  private async findProduct(id: string) {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) {
      throw new NotFoundException('Product not found.');
    }
    return product;
  }

  private buildCreateData(input: CreateProductRequest) {
    const name = this.requiredString('name', input.name);
    const barcode = this.requiredString('barcode', input.barcode);
    const salePrice = this.requiredMoney('salePrice', input.salePrice);
    return {
      name,
      barcode,
      category: this.optionalString(input.category),
      spec: this.optionalString(input.spec),
      salePrice,
      costPrice: this.optionalMoney('costPrice', input.costPrice),
      stock: this.optionalInteger('stock', input.stock) ?? 0,
      stockWarningValue: this.optionalInteger('stockWarningValue', input.stockWarningValue),
      enabled: input.enabled ?? true,
    };
  }

  private buildUpdateData(input: UpdateProductRequest) {
    const data: Record<string, unknown> = {};
    if (input.name !== undefined) data.name = this.requiredString('name', input.name);
    if (input.barcode !== undefined) data.barcode = this.requiredString('barcode', input.barcode);
    if (input.category !== undefined) data.category = this.optionalString(input.category);
    if (input.spec !== undefined) data.spec = this.optionalString(input.spec);
    if (input.salePrice !== undefined) data.salePrice = this.requiredMoney('salePrice', input.salePrice);
    if (input.costPrice !== undefined) data.costPrice = this.optionalMoney('costPrice', input.costPrice);
    if (input.stock !== undefined) data.stock = this.optionalInteger('stock', input.stock);
    if (input.stockWarningValue !== undefined) data.stockWarningValue = this.optionalInteger('stockWarningValue', input.stockWarningValue);
    if (input.enabled !== undefined) data.enabled = input.enabled;
    if (Object.keys(data).length === 0) {
      throw new UnprocessableEntityException('No product fields to update.');
    }
    return data;
  }

  private toPublicProduct(product: ProductRecord) {
    return {
      id: product.id,
      name: product.name,
      barcode: product.barcode,
      category: product.category,
      spec: product.spec,
      salePrice: product.salePrice.toFixed(2),
      stock: product.stock,
      stockWarningValue: product.stockWarningValue,
      enabled: product.enabled,
      createdAt: product.createdAt.toISOString(),
      updatedAt: product.updatedAt.toISOString(),
    };
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

  private requiredMoney(field: string, value?: string) {
    if (!value || !moneyPattern.test(value)) {
      throw new UnprocessableEntityException(`${field} must be a decimal string with up to 2 fraction digits.`);
    }
    return value;
  }

  private optionalMoney(field: string, value?: string) {
    if (value === undefined || value === '') return null;
    return this.requiredMoney(field, value);
  }

  private optionalInteger(field: string, value?: number) {
    if (value === undefined || value === null) return null;
    if (!Number.isInteger(value) || value < 0) {
      throw new UnprocessableEntityException(`${field} must be a non-negative integer.`);
    }
    return value;
  }

  private async writeAudit(actor: RequestUser, action: string, targetId: string, success: boolean, requestMeta?: RequestMeta, metadata?: Prisma.InputJsonObject) {
    await this.prisma.auditLog.create({
      data: {
        actorId: actor.id,
        action,
        targetType: 'product',
        targetId,
        ipAddress: requestMeta?.ipAddress,
        deviceInfo: requestMeta?.deviceInfo,
        success,
        metadata: metadata ?? Prisma.JsonNull,
      },
    });
  }

  private isUniqueError(error: unknown) {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
  }
}
