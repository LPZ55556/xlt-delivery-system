import { CanActivate, ExecutionContext, ForbiddenException, Injectable, InternalServerErrorException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../database/prisma.service';
import { IS_PUBLIC_ROUTE, REQUIRED_ROLES } from './auth.constants';
import type { RequestUser } from './current-user.decorator';

type AuthPayload = {
  sub: string;
  username: string;
  role: string;
};

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_ROUTE, [context.getHandler(), context.getClass()]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<{ headers: Record<string, string | undefined>; user?: RequestUser }>();
    const token = this.extractBearerToken(request.headers.authorization);
    const payload = await this.verifyToken(token);
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.enabled) {
      throw new UnauthorizedException('User is not available.');
    }

    request.user = {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      name: user.displayName,
      role: user.role,
      enabled: user.enabled,
      isActive: user.enabled,
    };

    const requiredRoles = this.reflector.getAllAndOverride<string[]>(REQUIRED_ROLES, [context.getHandler(), context.getClass()]);
    if (requiredRoles?.length && !requiredRoles.includes(user.role)) {
      throw new ForbiddenException('Insufficient role.');
    }

    return true;
  }

  private extractBearerToken(authorization?: string) {
    const [type, token] = authorization?.split(' ') ?? [];
    if (type !== 'Bearer' || !token) {
      throw new UnauthorizedException('Bearer token is required.');
    }
    return token;
  }

  private async verifyToken(token: string) {
    try {
      return await this.jwt.verifyAsync<AuthPayload>(token, { secret: this.getJwtSecret() });
    } catch {
      throw new UnauthorizedException('Invalid or expired token.');
    }
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
}
