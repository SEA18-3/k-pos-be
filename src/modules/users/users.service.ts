import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { QueryUsersDto } from './dto/query-users.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(ownerMerchantId: string, dto: CreateUserDto) {
    // 1. Cek duplikasi email
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existingUser) {
      throw new ConflictException('Email already registered');
    }

    // 2. Hash password
    const hashedPassword = await bcrypt.hash(dto.password, 10);

    // 3. Buat user baru, terikat ke merchant si OWNER
    const user = await this.prisma.user.create({
      data: {
        full_name: dto.full_name,
        email: dto.email,
        password: hashedPassword,
        role: dto.role,
        id_merchant: ownerMerchantId,
      },
      select: {
        id_user: true,
        full_name: true,
        email: true,
        role: true,
        id_merchant: true,
        is_active: true,
        created_at: true,
      },
    });

    return user;
  }

  async findAll(id_merchant: string, query: QueryUsersDto) {
    const users = await this.prisma.user.findMany({
      where: {
        id_merchant,
        ...(query.role !== undefined && { role: query.role }),
        ...(query.is_active !== undefined && { is_active: query.is_active }),
      },
      select: {
        id_user: true,
        full_name: true,
        email: true,
        role: true,
        id_merchant: true,
        is_active: true,
        created_at: true,
        updated_at: true,
      },
      orderBy: {
        created_at: 'desc',
      },
    });

    return { items: users };
  }

  async updateStatus(targetUserId: string, ownerMerchantId: string, dto: UpdateUserStatusDto) {
    // 1. Cari user yang ingin diubah statusnya
    const targetUser = await this.prisma.user.findUnique({
      where: { id_user: targetUserId },
    });

    if (!targetUser) {
      throw new NotFoundException('User not found');
    }

    // 2. Pastikan target user berada di merchant yang sama dengan si OWNER
    if (targetUser.id_merchant !== ownerMerchantId) {
      throw new ForbiddenException('You do not have permission to modify this user');
    }

    // 3. Update status is_active
    const updatedUser = await this.prisma.user.update({
      where: { id_user: targetUserId },
      data: { is_active: dto.is_active },
      select: {
        id_user: true,
        full_name: true,
        email: true,
        role: true,
        id_merchant: true,
        is_active: true,
        updated_at: true,
      },
    });

    // If user is being deactivated, revoke all their active sessions
    if (dto.is_active === false) {
      await this.prisma.refreshToken.deleteMany({
        where: { id_user: targetUserId },
      });
    }

    return updatedUser;
  }
}
