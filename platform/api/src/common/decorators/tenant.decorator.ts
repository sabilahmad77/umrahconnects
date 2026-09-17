import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/** The caller's organization id — always taken from the verified principal, never from the request body. */
export const TenantId = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  const request = ctx.switchToHttp().getRequest();
  return request.user?.tenantId;
});

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest();
  return request.user;
});
