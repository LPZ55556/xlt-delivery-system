import { ForbiddenException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Order, OrderItem, Prisma, Product } from '@prisma/client';
import type { RequestUser } from '../../common/auth/current-user.decorator';
import { PrismaService } from '../../database/prisma.service';
import type { CreateOrderRequest, OrderListQuery, VoidOrderRequest } from './dto';

type RequestMeta = { ipAddress?: string; deviceInfo?: string };

type OrderWithItems = Order & { items: OrderItem[] };

type MerchantSnapshot = {
  id: string;
  name: string;
  address: string;
  contactName: string | null;
  phone: string | null;
};

type UserSnapshot = {
  id: string;
  username: string;
  displayName: string;
  role: string;
};

const decimalCoordinatePattern = /^-?\d+(\.\d{1,7})?$/;
const orderReadAllRoles = new Set(['super_admin', 'admin', 'finance']);

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateOrderRequest, actor: RequestUser, requestMeta?: RequestMeta) {
    const merchantId = this.requiredString('merchantId', input.merchantId);
    const items = this.normalizeItems(input.items);
    const latitude = this.optionalCoordinate('latitude', input.latitude);
    const longitude = this.optionalCoordinate('longitude', input.longitude);
    const remark = this.optionalString(input.remark);

    const order = await this.prisma.$transaction(async (tx) => {
      const merchant = await tx.merchant.findUnique({ where: { id: merchantId } });
      if (!merchant || !merchant.isActive) throw new UnprocessableEntityException('merchantId is invalid or inactive.');

      const products = await tx.product.findMany({ where: { id: { in: items.map((item) => item.productId) }, enabled: true } });
      const productById = new Map(products.map((product) => [product.id, product]));
      for (const item of items) {
        if (!productById.has(item.productId)) throw new UnprocessableEntityException(`productId is invalid or inactive: ${item.productId}`);
      }

      const totalAmount = items.reduce((total, item) => {
        const product = productById.get(item.productId)!;
        return total.plus(product.salePrice.mul(item.quantity));
      }, new Prisma.Decimal(0));

      const created = await tx.order.create({
        data: {
          orderNo: this.generateOrderNo(),
          merchantId,
          salespersonId: actor.id,
          totalAmount,
          status: 'created',
          latitude,
          longitude,
          remark,
          items: {
            create: items.map((item) => {
              const product = productById.get(item.productId)!;
              return {
                productId: product.id,
                productNameSnapshot: product.name,
                productBarcodeSnapshot: product.barcode,
                productSpecSnapshot: product.spec,
                salePriceSnapshot: product.salePrice,
                costPriceSnapshot: product.costPrice,
                quantity: item.quantity,
                subtotalSnapshot: product.salePrice.mul(item.quantity),
              };
            }),
          },
        },
        include: { items: true },
      });

      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: 'ORDER_CREATED',
          targetType: 'order',
          targetId: created.id,
          ipAddress: requestMeta?.ipAddress,
          deviceInfo: requestMeta?.deviceInfo,
          success: true,
          metadata: { orderNo: created.orderNo, merchantId },
        },
      });

      return created;
    });

    return this.toOrderResponse(order, await this.getMerchantSnapshot(order.merchantId), await this.getUserSnapshot(order.salespersonId));
  }

  async list(query: OrderListQuery, actor: RequestUser) {
    const page = this.parsePage(query.page);
    const pageSize = this.parsePageSize(query.pageSize);
    const where = await this.buildOrderListWhere(query, actor);
    const [total, orders] = await Promise.all([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({ where, include: { items: true }, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
    ]);

    const merchantMap = await this.getMerchantSnapshotMap(orders.map((order) => order.merchantId));
    const userMap = await this.getUserSnapshotMap(orders.map((order) => order.salespersonId));

    return {
      items: orders.map((order) => this.toOrderResponse(order, merchantMap.get(order.merchantId) ?? null, userMap.get(order.salespersonId) ?? null)),
      total,
      page,
      pageSize,
    };
  }

  async getById(id: string, actor: RequestUser) {
    const order = await this.findOrder(id);
    this.assertCanReadOrder(order, actor);
    return this.toOrderResponse(order, await this.getMerchantSnapshot(order.merchantId), await this.getUserSnapshot(order.salespersonId));
  }

  async voidOrder(id: string, input: VoidOrderRequest, actor: RequestUser, requestMeta?: RequestMeta) {
    const reason = this.optionalString(input.reason);
    const order = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.order.findUnique({ where: { id }, include: { items: true } });
      if (!existing) throw new NotFoundException('Order not found.');
      if (existing.status === 'voided') return existing;

      const updated = await tx.order.update({
        where: { id },
        data: { status: 'voided', voidedAt: new Date(), voidReason: reason },
        include: { items: true },
      });

      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: 'ORDER_VOIDED',
          targetType: 'order',
          targetId: updated.id,
          ipAddress: requestMeta?.ipAddress,
          deviceInfo: requestMeta?.deviceInfo,
          success: true,
          metadata: { orderNo: updated.orderNo, reason: reason ?? null },
        },
      });

      return updated;
    });

    return this.toOrderResponse(order, await this.getMerchantSnapshot(order.merchantId), await this.getUserSnapshot(order.salespersonId));
  }

  async getReceipt(id: string, actor: RequestUser) {
    const order = await this.findOrder(id);
    this.assertCanReadOrder(order, actor);
    const merchant = await this.getMerchantSnapshot(order.merchantId);
    const salesperson = await this.getUserSnapshot(order.salespersonId);
    return {
      storeName: merchant?.name ?? 'Unknown Merchant',
      salespersonName: salesperson?.displayName ?? salesperson?.username ?? 'Unknown Salesperson',
      dateTime: order.createdAt.toISOString(),
      orderNo: order.orderNo,
      items: order.items.map((item) => ({
        productName: item.productNameSnapshot,
        spec: item.productSpecSnapshot,
        unitPrice: item.salePriceSnapshot.toFixed(2),
        quantity: item.quantity,
        subtotal: item.subtotalSnapshot.toFixed(2),
      })),
      totalAmount: order.totalAmount.toFixed(2),
    };
  }

  private buildOrderAccessWhere(actor: RequestUser): Prisma.OrderWhereInput {
    if (orderReadAllRoles.has(actor.role)) return {};
    if (actor.role === 'salesperson') return { salespersonId: actor.id };
    throw new ForbiddenException('Insufficient role to read orders.');
  }

  private async buildOrderListWhere(query: OrderListQuery, actor: RequestUser): Promise<Prisma.OrderWhereInput> {
    const where: Prisma.OrderWhereInput = { ...this.buildOrderAccessWhere(actor) };
    if (query.status) {
      if (!['created', 'printed', 'synced', 'voided'].includes(query.status)) throw new UnprocessableEntityException('status is invalid.');
      where.status = query.status as any;
    }
    const merchantId = query.merchantId?.trim();
    if (merchantId) where.merchantId = merchantId;
    const dateRange: Prisma.DateTimeFilter = {};
    if (query.dateFrom) dateRange.gte = this.parseDateStart(query.dateFrom, 'dateFrom');
    if (query.dateTo) dateRange.lte = this.parseDateEnd(query.dateTo, 'dateTo');
    if (dateRange.gte || dateRange.lte) where.createdAt = dateRange;
    const keyword = query.merchantKeyword?.trim();
    if (keyword) {
      const merchants = await this.prisma.merchant.findMany({ where: { name: { contains: keyword, mode: 'insensitive' } }, select: { id: true } });
      const merchantIds = merchants.map((merchant) => merchant.id);
      if (merchantId) {
        where.AND = [{ merchantId }, { merchantId: { in: merchantIds } }];
        delete where.merchantId;
      } else {
        where.merchantId = { in: merchantIds };
      }
    }
    return where;
  }

  private assertCanReadOrder(order: Order, actor: RequestUser) {
    if (orderReadAllRoles.has(actor.role)) return;
    if (actor.role === 'salesperson' && order.salespersonId === actor.id) return;
    throw new ForbiddenException('Insufficient role to read this order.');
  }

  private async findOrder(id: string) {
    const order = await this.prisma.order.findUnique({ where: { id }, include: { items: true } });
    if (!order) throw new NotFoundException('Order not found.');
    return order;
  }

  private normalizeItems(items?: CreateOrderRequest['items']) {
    if (!items?.length) throw new UnprocessableEntityException('items must not be empty.');
    const merged = new Map<string, number>();
    for (const item of items) {
      const productId = this.requiredString('productId', item.productId);
      const quantity = item.quantity;
      if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity <= 0) throw new UnprocessableEntityException('quantity must be a positive integer.');
      merged.set(productId, (merged.get(productId) ?? 0) + quantity);
    }
    return Array.from(merged.entries()).map(([productId, quantity]) => ({ productId, quantity }));
  }

  private toOrderResponse(order: OrderWithItems, merchant: MerchantSnapshot | null, salesperson: UserSnapshot | null) {
    return {
      id: order.id,
      orderNo: order.orderNo,
      merchantId: order.merchantId,
      salespersonId: order.salespersonId,
      merchant,
      salesperson,
      totalAmount: order.totalAmount.toFixed(2),
      status: order.status,
      latitude: order.latitude?.toString() ?? null,
      longitude: order.longitude?.toString() ?? null,
      remark: order.remark,
      voidedAt: order.voidedAt?.toISOString() ?? null,
      voidReason: order.voidReason,
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
      items: order.items.map((item) => ({
        id: item.id,
        productId: item.productId,
        productNameSnapshot: item.productNameSnapshot,
        productBarcodeSnapshot: item.productBarcodeSnapshot,
        productSpecSnapshot: item.productSpecSnapshot,
        salePriceSnapshot: item.salePriceSnapshot.toFixed(2),
        quantity: item.quantity,
        subtotal: item.subtotalSnapshot.toFixed(2),
      })),
    };
  }

  private async getMerchantSnapshot(id: string): Promise<MerchantSnapshot | null> {
    const merchant = await this.prisma.merchant.findUnique({ where: { id } });
    if (!merchant) return null;
    return { id: merchant.id, name: merchant.name, address: merchant.address, contactName: merchant.contactName, phone: merchant.phone };
  }

  private async getUserSnapshot(id: string): Promise<UserSnapshot | null> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) return null;
    return { id: user.id, username: user.username, displayName: user.displayName, role: user.role };
  }

  private async getMerchantSnapshotMap(ids: string[]) {
    const merchants = await this.prisma.merchant.findMany({ where: { id: { in: Array.from(new Set(ids)) } } });
    return new Map(merchants.map((merchant) => [merchant.id, { id: merchant.id, name: merchant.name, address: merchant.address, contactName: merchant.contactName, phone: merchant.phone }]));
  }

  private async getUserSnapshotMap(ids: string[]) {
    const users = await this.prisma.user.findMany({ where: { id: { in: Array.from(new Set(ids)) } } });
    return new Map(users.map((user) => [user.id, { id: user.id, username: user.username, displayName: user.displayName, role: user.role }]));
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
    if (!decimalCoordinatePattern.test(value)) throw new UnprocessableEntityException(`${field} must be a decimal string with up to 7 fraction digits.`);
    return value;
  }

  private parseDateStart(value: string, field: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new UnprocessableEntityException(`${field} must be YYYY-MM-DD.`);
    const date = new Date(`${value}T00:00:00.000+08:00`);
    if (Number.isNaN(date.getTime())) throw new UnprocessableEntityException(`${field} must be valid.`);
    return date;
  }

  private parseDateEnd(value: string, field: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new UnprocessableEntityException(`${field} must be YYYY-MM-DD.`);
    const date = new Date(`${value}T23:59:59.999+08:00`);
    if (Number.isNaN(date.getTime())) throw new UnprocessableEntityException(`${field} must be valid.`);
    return date;
  }

  private parsePage(value?: string) {
    const page = Number(value ?? 1);
    if (!Number.isInteger(page) || page < 1) throw new UnprocessableEntityException('page must be a positive integer.');
    return page;
  }

  private parsePageSize(value?: string) {
    const pageSize = Number(value ?? 20);
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) throw new UnprocessableEntityException('pageSize must be an integer between 1 and 100.');
    return pageSize;
  }

  private generateOrderNo() {
    const now = new Date();
    const timestamp = now.toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
    const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
    return `XLT${timestamp}${suffix}`;
  }
}
