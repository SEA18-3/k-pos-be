import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import type { StringValue } from 'ms';
import { PrismaService } from '../../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { Role } from '../../common/enums/role.enum';
import * as crypto from 'crypto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) { }

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

    // 3. Simpan user baru ke database
    const user = await this.prisma.user.create({
      data: {
        full_name: dto.full_name,
        email: dto.email,
        password: hashedPassword,
        role: dto.role ?? Role.OPERATOR,
      },
      select: {
        id_user: true,
        full_name: true,
        email: true,
        role: true,
        is_active: true,
        created_at: true,
      },
    });

    return { user };
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
    };
    const access_token = this.jwtService.sign(payload, {
      expiresIn: (process.env.JWT_EXPIRATION_TIME || '1d') as StringValue,
    });

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
      user: {
        id_user: user.id_user,
        full_name: user.full_name,
        email: user.email,
        role: user.role,
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
    };

    const access_token = this.jwtService.sign(payload, {
      expiresIn: (process.env.JWT_EXPIRATION_TIME || '1d') as StringValue,
    });

    return { access_token };
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
        is_active: true,
        created_at: true,
        updated_at: true,
      },
    });
    return { user };
  }
}
