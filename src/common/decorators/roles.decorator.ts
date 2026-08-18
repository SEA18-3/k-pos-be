import { SetMetadata } from '@nestjs/common';
import { Role } from '../enums/role.enum';

export const ROLES_KEY = 'roles';

/**
 * Decorator untuk mendefinisikan roles yang diizinkan mengakses endpoint.
 * Digunakan bersama RolesGuard.
 * @example
 * @Roles(Role.OWNER)
 * @Get('reports')
 * getReports() { ... }
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
