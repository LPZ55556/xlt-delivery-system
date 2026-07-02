import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export type RequestUser = {
  id: string;
  username: string;
  displayName: string;
  name: string;
  role: string;
  enabled: boolean;
  isActive: boolean;
};

export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext): RequestUser | undefined => {
  const request = context.switchToHttp().getRequest<{ user?: RequestUser }>();
  return request.user;
});
