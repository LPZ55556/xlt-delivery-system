import { ConflictException, ForbiddenException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma, UserRole, type User } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import type { RequestUser } from '../../common/auth/current-user.decorator';
import { PrismaService } from '../../database/prisma.service';
import type { CreateUserRequest, ResetUserPasswordRequest, UpdateUserRequest, UserListQuery } from './dto';

type RequestMeta = { ipAddress?: string; deviceInfo?: string };

const PASSWORD_MIN_LENGTH = 8;
const roles = new Set<string>(Object.values(UserRole));
const adminManageableRoles = new Set<string>(['finance', 'warehouse', 'salesperson']);

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: UserListQuery) {
    const page = this.parsePage(query.page);
    const pageSize = this.parsePageSize(query.pageSize);
    const search = query.search?.trim();
    const role = query.role?.trim();
    const isActive = this.parseBoolean(query.isActive);

    if (role && !roles.has(role)) throw new UnprocessableEntityException('role is invalid.');

    const where: Prisma.UserWhereInput = {
      ...(role ? { role: role as UserRole } : {}),
      ...(isActive === undefined ? {} : { enabled: isActive }),
      ...(search
        ? {
            OR: [
              { username: { contains: search, mode: 'insensitive' } },
              { displayName: { contains: search, mode: 'insensitive' } },
              { phone: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [total, users] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
    ]);

    return { items: users.map((user) => this.toResponse(user)), total, page, pageSize };
  }

  async getById(id: string) {
    return this.toResponse(await this.findUser(id));
  }

  getMe(actor: RequestUser) {
    return { user: this.toCurrentUserResponse(actor) };
  }

  async create(input: CreateUserRequest, actor: RequestUser, requestMeta?: RequestMeta) {
    const role = this.requiredRole(input.role);
    this.assertCanManageRole(actor, role, 'create');
    const username = this.requiredString('username', input.username);
    const displayName = this.requiredString('name', input.name);
    const password = this.requiredPassword(input.password);
    const passwordHash = await bcrypt.hash(password, 12);

    try {
      const user = await this.prisma.user.create({
        data: {
          username,
          displayName,
          phone: this.optionalString(input.phone),
          role,
          passwordHash,
          enabled: true,
        },
      });
      await this.writeAudit(actor, 'USER_CREATED', user.id, true, requestMeta, { username: user.username, role: user.role });
      return this.toResponse(user);
    } catch (error) {
      if (this.isUniqueError(error)) throw new ConflictException('Username already exists.');
      throw error;
    }
  }

  async update(id: string, input: UpdateUserRequest, actor: RequestUser, requestMeta?: RequestMeta) {
    const target = await this.findUser(id);
    this.assertCanManageTarget(actor, target, 'update');

    const data: Prisma.UserUpdateInput = {};
    if (input.name !== undefined) data.displayName = this.requiredString('name', input.name);
    if (input.phone !== undefined) data.phone = this.optionalString(input.phone);

    let nextRole: UserRole | undefined;
    if (input.role !== undefined) {
      nextRole = this.requiredRole(input.role);
      if (actor.id === target.id && nextRole !== target.role) throw new ForbiddenException('You cannot change your own role.');
      this.assertCanManageRole(actor, nextRole, 'assign');
      data.role = nextRole;
    }

    if (Object.keys(data).length === 0) throw new UnprocessableEntityException('No user fields to update.');

    const updated = await this.prisma.user.update({ where: { id }, data });
    await this.writeAudit(actor, 'USER_UPDATED', updated.id, true, requestMeta, { fields: Object.keys(data) });
    if (nextRole && nextRole !== target.role) {
      await this.writeAudit(actor, 'USER_ROLE_CHANGED', updated.id, true, requestMeta, { from: target.role, to: nextRole });
    }
    return this.toResponse(updated);
  }

  async resetPassword(id: string, input: ResetUserPasswordRequest, actor: RequestUser, requestMeta?: RequestMeta) {
    const target = await this.findUser(id);
    this.assertCanManageTarget(actor, target, 'reset password');
    const password = this.requiredPassword(input.newPassword);
    const passwordHash = await bcrypt.hash(password, 12);
    const updated = await this.prisma.user.update({ where: { id }, data: { passwordHash } });
    await this.writeAudit(actor, 'USER_PASSWORD_RESET', updated.id, true, requestMeta, { username: updated.username });
    return this.toResponse(updated);
  }

  async disable(id: string, actor: RequestUser, requestMeta?: RequestMeta) {
    const target = await this.findUser(id);
    if (actor.id === target.id) throw new ForbiddenException('You cannot disable yourself.');
    this.assertCanManageTarget(actor, target, 'disable');
    const updated = await this.prisma.user.update({ where: { id }, data: { enabled: false } });
    await this.writeAudit(actor, 'USER_DISABLED', updated.id, true, requestMeta, { username: updated.username });
    return this.toResponse(updated);
  }

  async enable(id: string, actor: RequestUser, requestMeta?: RequestMeta) {
    const target = await this.findUser(id);
    this.assertCanManageTarget(actor, target, 'enable');
    const updated = await this.prisma.user.update({ where: { id }, data: { enabled: true } });
    await this.writeAudit(actor, 'USER_ENABLED', updated.id, true, requestMeta, { username: updated.username });
    return this.toResponse(updated);
  }

  private async findUser(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found.');
    return user;
  }

  private assertCanManageTarget(actor: RequestUser, target: User, action: string) {
    if (actor.role === 'super_admin') return;
    if (actor.role === 'admin' && adminManageableRoles.has(target.role)) return;
    throw new ForbiddenException(`Insufficient role to ${action} this user.`);
  }

  private assertCanManageRole(actor: RequestUser, role: UserRole, action: string) {
    if (actor.role === 'super_admin') return;
    if (actor.role === 'admin' && adminManageableRoles.has(role)) return;
    throw new ForbiddenException(`Insufficient role to ${action} this role.`);
  }

  private requiredRole(value?: string): UserRole {
    const role = value?.trim();
    if (!role || !roles.has(role)) throw new UnprocessableEntityException('role is invalid.');
    return role as UserRole;
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

  private requiredPassword(value?: string) {
    if (!value) throw new UnprocessableEntityException('password is required.');
    if (value.length < PASSWORD_MIN_LENGTH) throw new UnprocessableEntityException(`password must be at least ${PASSWORD_MIN_LENGTH} characters.`);
    return value;
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

  private parseBoolean(value?: string) {
    if (value === undefined || value === '') return undefined;
    if (value === 'true') return true;
    if (value === 'false') return false;
    throw new UnprocessableEntityException('isActive must be true or false.');
  }

  private toCurrentUserResponse(user: RequestUser) {
    return {
      id: user.id,
      username: user.username,
      name: user.displayName,
      displayName: user.displayName,
      role: user.role,
      isActive: user.enabled,
      enabled: user.enabled,
    };
  }

  private toResponse(user: User) {
    return {
      id: user.id,
      username: user.username,
      name: user.displayName,
      displayName: user.displayName,
      phone: user.phone,
      role: user.role,
      isActive: user.enabled,
      enabled: user.enabled,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    };
  }

  private async writeAudit(actor: RequestUser, action: string, targetId: string, success: boolean, requestMeta?: RequestMeta, metadata?: Prisma.InputJsonObject) {
    await this.prisma.auditLog.create({
      data: {
        actorId: actor.id,
        action,
        targetType: 'user',
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
