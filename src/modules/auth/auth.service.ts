import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import type { StringValue } from 'ms';
import { PrismaService } from '../../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { Role } from '../../common/enums/role.enum';
import * as crypto from 'crypto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    // 1. Cek apakah email sudah terdaftar
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existingUser) {
      throw new ConflictException('Email already registered');
    }

    // 2. Hash password
    const hashedPassword = await bcrypt.hash(dto.password, 10);

    // 3. Buat Merchant & User secara atomik dalam satu transaksi database
    // Jika salah satu gagal, keduanya di-rollback otomatis
    const result = await this.prisma.$transaction(async (tx) => {
      // 3a. Buat record Merchant baru
      const merchant = await tx.merchant.create({
        data: {
          name: dto.merchant_name,
        },
      });

      // 3b. Buat User OWNER dan kaitkan ke merchant yang baru dibuat
      const user = await tx.user.create({
        data: {
          full_name: dto.full_name,
          email: dto.email,
          password: hashedPassword,
          role: Role.OWNER,
          id_merchant: merchant.id_merchant,
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

      return { user };
    });

    return result;
  }

  async login(dto: LoginDto) {
    // 1. Cari user berdasarkan email
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user || !user.is_active) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // 2. Bandingkan password dengan hash
    const isPasswordValid = await bcrypt.compare(dto.password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // 3. Sign JWT token
    const payload = {
      sub: user.id_user,
      email: user.email,
      role: user.role,
      id_merchant: user.id_merchant,
    };
    const access_token = this.jwtService.sign(payload, {
      expiresIn: '15m' as StringValue,
    });

    // Generate offline lease JWT for OPERATOR role (7-day, for offline PWA use)
    let offline_lease: string | undefined;
    if (user.role === Role.OPERATOR) {
      offline_lease = this.jwtService.sign(
        {
          ...payload,
          merchant_name: (await this.prisma.merchant.findUnique({ where: { id_merchant: user.id_merchant! }, select: { name: true } }))?.name,
          type: 'offline_lease',
        },
        { expiresIn: '7d' as StringValue },
      );
    }

    const refresh_token = crypto.randomBytes(40).toString('hex');
    const expires_at = new Date();
    expires_at.setDate(expires_at.getDate() + 7); // 7 days

    await this.prisma.refreshToken.create({
      data: {
        id_user: user.id_user,
        token: refresh_token,
        expires_at,
      },
    });

    return {
      access_token,
      refresh_token,
      ...(offline_lease ? { offline_lease } : {}),
      user: {
        id_user: user.id_user,
        full_name: user.full_name,
        email: user.email,
        role: user.role,
        id_merchant: user.id_merchant,
        is_active: user.is_active,
      },
    };
  }

  async refresh(refreshToken: string) {
    const tokenRecord = await this.prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: { user: true },
    });

    if (!tokenRecord || tokenRecord.expires_at < new Date()) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (!tokenRecord.user.is_active) {
      throw new UnauthorizedException('User is not active');
    }

    const payload = {
      sub: tokenRecord.user.id_user,
      email: tokenRecord.user.email,
      role: tokenRecord.user.role,
      id_merchant: tokenRecord.user.id_merchant,
    };

    const access_token = this.jwtService.sign(payload, {
      expiresIn: '15m' as StringValue,
    });

    // Rotating refresh token: delete old one and create a new one
    await this.prisma.refreshToken.delete({
      where: { id: tokenRecord.id },
    });

    const new_refresh_token = crypto.randomBytes(40).toString('hex');
    const expires_at = new Date();
    expires_at.setDate(expires_at.getDate() + 7);

    await this.prisma.refreshToken.create({
      data: {
        id_user: tokenRecord.user.id_user,
        token: new_refresh_token,
        expires_at,
      },
    });

    return { access_token, refresh_token: new_refresh_token };
  }

  async logout(refreshToken: string) {
    // Delete the refresh token to revoke it
    await this.prisma.refreshToken.deleteMany({
      where: { token: refreshToken },
    });

    return { success: true };
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id_user: userId },
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
    });
    return { user };
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id_user: userId },
    });

    const isMatch = await bcrypt.compare(dto.current_password, user.password);
    if (!isMatch) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const hashedNew = await bcrypt.hash(dto.new_password, 10);

    // Update password and invalidate ALL sessions (force re-login on all devices)
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id_user: userId },
        data: { password: hashedNew },
      }),
      this.prisma.refreshToken.deleteMany({
        where: { id_user: userId },
      }),
    ]);

    return { success: true, message: 'Password changed. Please log in again.' };
  }
}
