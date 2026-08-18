import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { QueryUsersDto } from './dto/query-users.dto';
import { ChangePasswordDto, UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
  ) {}

  async create(ownerId: string, merchantId: string, dto: CreateUserDto) {
    const email = dto.email.trim().toLowerCase();
    if (await this.prisma.user.findUnique({ where: { email } })) {
      throw new ConflictException({
        code: 'EMAIL_ALREADY_REGISTERED',
        message: 'Email already registered',
      });
    }
    const password = await bcrypt.hash(dto.password, 12);
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          id_merchant: merchantId,
          full_name: dto.full_name.trim(),
          email,
          password,
          role: dto.role,
        },
        select: userSelect,
      });
      await tx.auditEvent.create({
        data: audit(merchantId, ownerId, 'USER_CREATED', user.id_user, { role: user.role }),
      });
      return user;
    });
  }

  async findAll(merchantId: string, query: QueryUsersDto) {
    return {
      items: await this.prisma.user.findMany({
        where: {
          id_merchant: merchantId,
          ...(query.role ? { role: query.role } : {}),
          ...(query.is_active === undefined ? {} : { is_active: query.is_active }),
        },
        select: userSelect,
        orderBy: [{ role: 'asc' }, { full_name: 'asc' }],
      }),
    };
  }

  async update(ownerId: string, merchantId: string, targetId: string, dto: UpdateUserDto) {
    const target = await this.getManagedUser(merchantId, targetId);
    if (target.role === 'OWNER') {
      throw new ForbiddenException({
        code: 'PRIMARY_OWNER_PROTECTED',
        message: 'Primary Owner cannot be edited through user administration',
      });
    }
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id_user: targetId },
        data: {
          ...(dto.full_name ? { full_name: dto.full_name.trim() } : {}),
          ...(dto.role ? { role: dto.role } : {}),
        },
        select: userSelect,
      });
      await tx.auditEvent.create({
        data: audit(merchantId, ownerId, 'USER_UPDATED', targetId, dto),
      });
      return user;
    });
  }

  async updateStatus(
    ownerId: string,
    merchantId: string,
    targetId: string,
    dto: UpdateUserStatusDto,
  ) {
    const target = await this.getManagedUser(merchantId, targetId);
    if (target.role === 'OWNER' || targetId === ownerId) {
      throw new ForbiddenException({
        code: 'PRIMARY_OWNER_PROTECTED',
        message: 'Primary Owner cannot be deactivated',
      });
    }
    const user = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id_user: targetId },
        data: { is_active: dto.is_active },
        select: userSelect,
      });
      await tx.auditEvent.create({
        data: audit(
          merchantId,
          ownerId,
          dto.is_active ? 'USER_ACTIVATED' : 'USER_DEACTIVATED',
          targetId,
        ),
      });
      return updated;
    });
    if (!dto.is_active) await this.auth.revokeUserSessions(targetId);
    return user;
  }

  async changePassword(
    ownerId: string,
    merchantId: string,
    targetId: string,
    dto: ChangePasswordDto,
  ) {
    const target = await this.getManagedUser(merchantId, targetId);
    if (target.role === 'OWNER' && targetId !== ownerId) {
      throw new ForbiddenException({
        code: 'PRIMARY_OWNER_PROTECTED',
        message: 'Cannot change another Owner password',
      });
    }
    const password = await bcrypt.hash(dto.new_password, 12);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id_user: targetId }, data: { password } });
      await tx.auditEvent.create({
        data: audit(merchantId, ownerId, 'USER_PASSWORD_CHANGED', targetId),
      });
    });
    await this.auth.revokeUserSessions(targetId);
    return { success: true };
  }

  private async getManagedUser(merchantId: string, targetId: string) {
    const target = await this.prisma.user.findFirst({
      where: { id_user: targetId, id_merchant: merchantId },
    });
    if (!target) throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'User not found' });
    return target;
  }
}

const userSelect = {
  id_user: true,
  id_merchant: true,
  full_name: true,
  email: true,
  role: true,
  is_active: true,
  created_at: true,
  updated_at: true,
} as const;

function audit(
  id_merchant: string,
  id_actor: string,
  action: string,
  entity_id: string,
  metadata?: object,
) {
  return {
    id_merchant,
    id_actor,
    action,
    entity_type: 'USER',
    entity_id,
    ...(metadata ? { metadata } : {}),
  };
}
