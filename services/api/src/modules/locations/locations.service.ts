import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { RequestUser } from '../../common/auth/current-user.decorator';
import { PrismaService } from '../../database/prisma.service';
import type { CheckInRequest, TrackPointInput, UploadTrackPointsRequest } from './dto';

type RequestMeta = { ipAddress?: string; deviceInfo?: string };
const decimalCoordinatePattern = /^-?\d+(\.\d{1,7})?$/;
const decimalMetricPattern = /^\d+(\.\d{1,2})?$/;
const manageLatestRoles = new Set(['super_admin', 'admin']);

@Injectable()
export class LocationsService {
  constructor(private readonly prisma: PrismaService) {}

  async checkIn(input: CheckInRequest, actor: RequestUser, requestMeta?: RequestMeta) {
    const merchantId = this.requiredString('merchantId', input.merchantId);
    const merchant = await this.prisma.merchant.findUnique({ where: { id: merchantId } });
    if (!merchant || !merchant.isActive) throw new NotFoundException('Merchant not found or inactive.');
    const latitude = this.optionalCoordinate('latitude', input.latitude);
    const longitude = this.optionalCoordinate('longitude', input.longitude);
    const address = this.optionalString(input.address);

    const checkIn = await this.prisma.$transaction(async (tx) => {
      const created = await tx.merchantCheckIn.create({ data: { userId: actor.id, merchantId, latitude: latitude ?? undefined, longitude: longitude ?? undefined, address } });
      if (latitude && longitude) {
        await tx.userLatestLocation.upsert({ where: { userId: actor.id }, create: { userId: actor.id, latitude, longitude, address, recordedAt: created.createdAt }, update: { latitude, longitude, address, recordedAt: created.createdAt } });
      }
      await tx.auditLog.create({ data: { actorId: actor.id, action: 'LOCATION_CHECK_IN_CREATED', targetType: 'merchant', targetId: merchantId, ipAddress: requestMeta?.ipAddress, deviceInfo: requestMeta?.deviceInfo, success: true, metadata: { latitude, longitude, withoutLocation: !(latitude && longitude) } } });
      return created;
    });

    return { id: checkIn.id, userId: checkIn.userId, merchantId: checkIn.merchantId, latitude: checkIn.latitude?.toString() ?? null, longitude: checkIn.longitude?.toString() ?? null, address: checkIn.address, createdAt: checkIn.createdAt.toISOString() };
  }

  async uploadTrackPoints(input: UploadTrackPointsRequest, actor: RequestUser, requestMeta?: RequestMeta) {
    const points = this.normalizePoints(input.points);
    const created = await this.prisma.$transaction(async (tx) => {
      const rows = await Promise.all(points.map((point) => tx.locationTrackPoint.create({ data: { userId: actor.id, ...point } })));
      const latest = rows.reduce((a, b) => (a.recordedAt > b.recordedAt ? a : b));
      await tx.userLatestLocation.upsert({ where: { userId: actor.id }, create: { userId: actor.id, latitude: latest.latitude, longitude: latest.longitude, accuracy: latest.accuracy, speed: latest.speed, recordedAt: latest.recordedAt }, update: { latitude: latest.latitude, longitude: latest.longitude, accuracy: latest.accuracy, speed: latest.speed, recordedAt: latest.recordedAt } });
      await tx.auditLog.create({ data: { actorId: actor.id, action: 'TRACK_POINTS_UPLOADED', targetType: 'location_track_point', targetId: actor.id, ipAddress: requestMeta?.ipAddress, deviceInfo: requestMeta?.deviceInfo, success: true, metadata: { count: rows.length } } });
      return rows;
    });
    return { count: created.length, items: created.map((point) => this.toTrackPoint(point)) };
  }

  async myTodayTrack(actor: RequestUser) {
    const now = new Date();
    const since = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const [points, checkIns] = await Promise.all([
      this.prisma.locationTrackPoint.findMany({ where: { userId: actor.id, recordedAt: { gte: since } }, orderBy: { recordedAt: 'asc' } }),
      this.prisma.merchantCheckIn.findMany({ where: { userId: actor.id, createdAt: { gte: since } }, orderBy: { createdAt: 'asc' } }),
    ]);
    return { points: points.map((point) => this.toTrackPoint(point)), checkIns: checkIns.map((item) => ({ id: item.id, merchantId: item.merchantId, latitude: item.latitude?.toString() ?? null, longitude: item.longitude?.toString() ?? null, address: item.address, createdAt: item.createdAt.toISOString() })) };
  }

  async latestUsers(actor: RequestUser) {
    if (!manageLatestRoles.has(actor.role)) throw new UnprocessableEntityException('Only admin roles can view latest user locations.');
    const latest = await this.prisma.userLatestLocation.findMany({ orderBy: { recordedAt: 'desc' } });
    const users = await this.prisma.user.findMany({ where: { id: { in: latest.map((item) => item.userId) } } });
    const userMap = new Map(users.map((user) => [user.id, user]));
    return { items: latest.map((item) => ({ userId: item.userId, username: userMap.get(item.userId)?.username ?? null, displayName: userMap.get(item.userId)?.displayName ?? null, latitude: item.latitude.toString(), longitude: item.longitude.toString(), address: item.address, accuracy: item.accuracy?.toString() ?? null, speed: item.speed?.toString() ?? null, recordedAt: item.recordedAt.toISOString(), updatedAt: item.updatedAt.toISOString() })) };
  }

  private normalizePoints(points?: TrackPointInput[]) {
    if (!points?.length) throw new UnprocessableEntityException('points must not be empty.');
    if (points.length > 500) throw new UnprocessableEntityException('points cannot exceed 500 items.');
    return points.map((point) => ({ latitude: this.requiredCoordinate('latitude', point.latitude), longitude: this.requiredCoordinate('longitude', point.longitude), recordedAt: point.recordedAt ? new Date(point.recordedAt) : new Date(), accuracy: this.optionalMetric('accuracy', point.accuracy), speed: this.optionalMetric('speed', point.speed) }));
  }

  private toTrackPoint(point: { id: string; userId: string; latitude: Prisma.Decimal; longitude: Prisma.Decimal; accuracy: Prisma.Decimal | null; speed: Prisma.Decimal | null; recordedAt: Date; createdAt: Date }) {
    return { id: point.id, userId: point.userId, latitude: point.latitude.toString(), longitude: point.longitude.toString(), accuracy: point.accuracy?.toString() ?? null, speed: point.speed?.toString() ?? null, recordedAt: point.recordedAt.toISOString(), createdAt: point.createdAt.toISOString() };
  }

  private requiredString(field: string, value?: string) { const normalized = value?.trim(); if (!normalized) throw new UnprocessableEntityException(`${field} is required.`); return normalized; }
  private optionalString(value?: string) { const normalized = value?.trim(); return normalized || null; }
  private requiredCoordinate(field: string, value?: string) { if (!value || !decimalCoordinatePattern.test(value)) throw new UnprocessableEntityException(`${field} must be a decimal string with up to 7 fraction digits.`); return value; }
  private optionalCoordinate(field: string, value?: string) { if (value === undefined || value === '') return null; if (!decimalCoordinatePattern.test(value)) throw new UnprocessableEntityException(`${field} must be a decimal string with up to 7 fraction digits.`); return value; }
  private optionalMetric(field: string, value?: string) { if (value === undefined || value === '') return null; if (!decimalMetricPattern.test(value)) throw new UnprocessableEntityException(`${field} must be a decimal string with up to 2 fraction digits.`); return value; }
}
