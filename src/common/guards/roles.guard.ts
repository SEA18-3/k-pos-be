import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { Role } from '../enums/role.enum';
import { JwtPayload } from '../decorators/current-user.decorator';

/**
 * Guard yang memeriksa apakah role user sesuai dengan @Roles() decorator.
 * Harus digunakan SETELAH JwtAuthGuard.
 * @example
 * @UseGuards(JwtAuthGuard, RolesGuard)
 * @Roles(Role.OWNER)
 * @Delete(':id')
 * remove() { ... }
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // Jika tidak ada @Roles() decorator, izinkan akses (hanya butuh JWT valid)
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request & { user: JwtPayload }>();
    const user = request.user;

    if (!user || !requiredRoles.includes(user.role as Role)) {
      throw new ForbiddenException('You do not have permission to access this resource');
    }

    return true;
  }
}
