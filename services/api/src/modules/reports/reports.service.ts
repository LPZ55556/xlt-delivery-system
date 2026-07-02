import { ForbiddenException, Injectable, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { RequestUser } from '../../common/auth/current-user.decorator';
import { PrismaService } from '../../database/prisma.service';
import type { ProductSalesRankingQuery } from './dto';

const allSalesRankingRoles = new Set(['super_admin', 'admin', 'finance']);

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async productSalesRanking(query: ProductSalesRankingQuery, actor: RequestUser) {
    const range = query.range ?? 'today';
    const limit = this.parseLimit(query.limit);
    const since = this.rangeStart(range);
    const salespersonId = this.resolveSalespersonId(query.salespersonId, actor);

    const rows = await this.prisma.orderItem.findMany({
      where: {
        order: {
          status: { not: 'voided' },
          createdAt: { gte: since },
          ...(salespersonId ? { salespersonId } : {}),
        },
      },
      select: {
        productId: true,
        productNameSnapshot: true,
        productBarcodeSnapshot: true,
        quantity: true,
        subtotalSnapshot: true,
      },
    });

    const byProduct = new Map<string, { productId: string; productName: string; barcode: string; quantitySold: number; salesAmount: Prisma.Decimal }>();
    for (const row of rows) {
      const existing = byProduct.get(row.productId) ?? {
        productId: row.productId,
        productName: row.productNameSnapshot,
        barcode: row.productBarcodeSnapshot,
        quantitySold: 0,
        salesAmount: new Prisma.Decimal(0),
      };
      existing.quantitySold += row.quantity;
      existing.salesAmount = existing.salesAmount.plus(row.subtotalSnapshot);
      byProduct.set(row.productId, existing);
    }

    return {
      range,
      items: Array.from(byProduct.values())
        .sort((a, b) => b.quantitySold - a.quantitySold || Number(b.salesAmount.minus(a.salesAmount)))
        .slice(0, limit)
        .map((item, index) => ({
          rank: index + 1,
          productId: item.productId,
          productName: item.productName,
          barcode: item.barcode,
          quantitySold: item.quantitySold,
          salesAmount: item.salesAmount.toFixed(2),
        })),
    };
  }

  private resolveSalespersonId(requestedSalespersonId: string | undefined, actor: RequestUser) {
    if (actor.role === 'salesperson') return actor.id;
    if (allSalesRankingRoles.has(actor.role)) return requestedSalespersonId?.trim() || undefined;
    if (actor.role === 'warehouse') return requestedSalespersonId?.trim() || undefined;
    throw new ForbiddenException('Insufficient role to view reports.');
  }

  private parseLimit(value?: string) {
    const limit = Number(value ?? 20);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new UnprocessableEntityException('limit must be an integer between 1 and 100.');
    return limit;
  }

  private rangeStart(range: string) {
    const now = new Date();
    if (range === 'today') return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (range === '7d') return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    if (range === 'month') return new Date(now.getFullYear(), now.getMonth(), 1);
    throw new UnprocessableEntityException('range must be today, 7d or month.');
  }
}
