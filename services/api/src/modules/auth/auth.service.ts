import { Injectable, InternalServerErrorException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../database/prisma.service';
import type { AuthTokenPayload, LoginRequest } from './dto';

type RequestMeta = { ipAddress?: string; deviceInfo?: string };

type PublicUser = {
  id: string;
  username: string;
  name: string;
  displayName: string;
  role: string;
  isActive: boolean;
  enabled: boolean;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async login(input: LoginRequest, requestMeta?: RequestMeta) {
    const username = input.username?.trim();
    const password = input.password ?? '';
    if (!username || !password) {
      throw new UnauthorizedException('Invalid username or password.');
    }

    const user = await this.prisma.user.findUnique({ where: { username } });
    if (user && !user.enabled) {
      await this.writeLoginAudit('USER_LOGIN_FAILED_DISABLED', user.id, username, false, requestMeta);
      throw new UnauthorizedException('Invalid username or password.');
    }

    const passwordMatches = user ? await bcrypt.compare(password, user.passwordHash) : false;
    if (!user || !passwordMatches) {
      await this.writeLoginAudit('LOGIN_FAILED', user?.id, username, false, requestMeta);
      throw new UnauthorizedException('Invalid username or password.');
    }

    const payload: AuthTokenPayload = { sub: user.id, username: user.username, role: user.role };
    const expiresIn = this.config.get<string>('app.jwtExpiresIn', '7d') as JwtSignOptions['expiresIn'];
    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.getJwtSecret(),
      expiresIn,
    });

    await this.writeLoginAudit('LOGIN_SUCCEEDED', user.id, username, true, requestMeta);

    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn: this.config.get<string>('app.jwtExpiresIn', '7d'),
      user: this.toPublicUser(user),
    };
  }

  async getCurrentUser(authorization?: string) {
    const token = this.extractBearerToken(authorization);
    const payload = await this.jwt.verifyAsync<AuthTokenPayload>(token, { secret: this.getJwtSecret() });
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.enabled) {
      throw new UnauthorizedException('User is not available.');
    }

    return { user: this.toPublicUser(user) };
  }

  private extractBearerToken(authorization?: string) {
    const [type, token] = authorization?.split(' ') ?? [];
    if (type !== 'Bearer' || !token) {
      throw new UnauthorizedException('Bearer token is required.');
    }
    return token;
  }

  private getJwtSecret() {
    const secret = this.config.get<string>('app.jwtSecret');
    const nodeEnv = this.config.get<string>('app.nodeEnv');
    if (!secret) {
      throw new InternalServerErrorException('JWT_SECRET is required.');
    }
    if (nodeEnv === 'production' && secret === 'change_me') {
      throw new InternalServerErrorException('JWT_SECRET must be changed in production.');
    }
    return secret;
  }

  private toPublicUser(user: { id: string; username: string; displayName: string; role: string; enabled: boolean }): PublicUser {
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

  private async writeLoginAudit(action: string, actorId: string | undefined, username: string, success: boolean, requestMeta?: RequestMeta) {
    await this.prisma.auditLog.create({
      data: {
        actorId,
        action,
        targetType: 'user',
        targetId: actorId,
        ipAddress: requestMeta?.ipAddress,
        deviceInfo: requestMeta?.deviceInfo,
        success,
        metadata: { username },
      },
    });
  }
}
