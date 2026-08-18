import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';

export interface JwtPayload {
  sub: string;
  email: string;
  role: 'OWNER' | 'ENTRY' | 'OPERATOR';
  id_merchant: string;
  sid: string;
  id_device?: string;
  iat?: number;
  exp?: number;
}

/**
 * Decorator untuk mengekstrak data user yang sudah terautentikasi dari JWT payload.
 * @example
 * @Get('profile')
 * @UseGuards(JwtAuthGuard)
 * getProfile(@CurrentUser() user: JwtPayload) { ... }
 */
export const CurrentUser = createParamDecorator(
  (
    data: keyof JwtPayload | undefined,
    ctx: ExecutionContext,
  ): JwtPayload[keyof JwtPayload] | JwtPayload | undefined => {
    const request = ctx.switchToHttp().getRequest<Request & { user: JwtPayload }>();
    const user = request.user;
    return data ? user?.[data] : user;
  },
);
