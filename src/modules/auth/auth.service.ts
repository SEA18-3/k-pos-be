import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { StringValue } from 'ms';
import { PrismaService } from '../../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { Role } from '../../common/enums/role.enum';
import type { JwtPayload } from '../../common/decorators/current-user.decorator';

const ACCESS_TTL = (process.env.JWT_EXPIRATION_TIME ?? '15m') as StringValue;
const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const OFFLINE_TTL = (process.env.OFFLINE_LEASE_TTL ?? '7d') as StringValue;

type AuthenticatedUser = {
  id_user: string;
  id_merchant: string;
  full_name: string;
  email: string;
  role: 'OWNER' | 'ENTRY' | 'OPERATOR';
  is_active: boolean;
};

export type AuthResult = {
  refreshToken: string;
  body: {
    access_token: string;
    offline_lease: string | null;
    expires_in_seconds: number;
    user: Omit<AuthenticatedUser, 'is_active'>;
  };
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const email = dto.email.trim().toLowerCase();
    if (await this.prisma.user.findUnique({ where: { email } })) {
      throw new ConflictException({
        code: 'EMAIL_ALREADY_REGISTERED',
        message: 'Email already registered',
      });
    }

    const password = await bcrypt.hash(dto.password, 12);
    return this.prisma.$transaction(async (tx) => {
      const merchant = await tx.merchant.create({
        data: { name: dto.merchant_name.trim(), timezone: dto.timezone ?? 'Asia/Jakarta' },
      });
      const user = await tx.user.create({
        data: {
          id_merchant: merchant.id_merchant,
          full_name: dto.full_name.trim(),
          email,
          password,
          role: Role.OWNER,
        },
        select: {
          id_user: true,
          id_merchant: true,
          full_name: true,
          email: true,
          role: true,
          is_active: true,
          created_at: true,
        },
      });
      await tx.auditEvent.create({
        data: {
          id_merchant: merchant.id_merchant,
          id_actor: user.id_user,
          action: 'MERCHANT_REGISTERED',
          entity_type: 'MERCHANT',
          entity_id: merchant.id_merchant,
        },
      });
      return { merchant, user };
    });
  }

  async login(dto: LoginDto): Promise<AuthResult> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.trim().toLowerCase() },
    });
    if (!user || !user.is_active || !(await bcrypt.compare(dto.password, user.password))) {
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid credentials',
      });
    }

    let deviceId: string | undefined;
    if (user.role === Role.OPERATOR) {
      if (!dto.device_id) {
        throw new BadRequestException({
          code: 'DEVICE_REQUIRED',
          message: 'Operator login requires a paired device',
        });
      }
      const device = await this.prisma.device.findFirst({
        where: {
          id_device: dto.device_id,
          id_merchant: user.id_merchant,
          is_active: true,
          status: 'PAIRED',
        },
      });
      if (!device) {
        throw new UnauthorizedException({
          code: 'DEVICE_NOT_PAIRED',
          message: 'Device is not paired with this merchant',
        });
      }
      deviceId = device.id_device;
    }

    return this.createSession(user, deviceId);
  }

  async refresh(rawToken: string): Promise<AuthResult> {
    const tokenHash = hashToken(rawToken);
    const rotation = await this.prisma.$transaction(async (tx) => {
      const token = await tx.authRefreshToken.findUnique({
        where: { token_hash: tokenHash },
        include: { session: { include: { user: true, device: true } } },
      });
      if (!token) return { kind: 'invalid' as const };

      const now = new Date();
      const sessionInvalid =
        token.revoked_at !== null ||
        token.expires_at <= now ||
        token.session.revoked_at !== null ||
        token.session.expires_at <= now;
      if (sessionInvalid) return { kind: 'invalid' as const };

      const claimed = await tx.authRefreshToken.updateMany({
        where: { id_token: token.id_token, used_at: null, revoked_at: null },
        data: { used_at: now },
      });
      if (claimed.count !== 1) {
        await tx.authSession.update({
          where: { id_session: token.id_session },
          data: { revoked_at: now },
        });
        await tx.authRefreshToken.updateMany({
          where: { id_session: token.id_session, revoked_at: null },
          data: { revoked_at: now },
        });
        return { kind: 'reused' as const };
      }

      const user = token.session.user;
      const device = token.session.device;
      if (
        !user.is_active ||
        (user.role === Role.OPERATOR &&
          (!device || !device.is_active || device.status !== 'PAIRED'))
      ) {
        await tx.authSession.update({
          where: { id_session: token.id_session },
          data: { revoked_at: now },
        });
        return { kind: 'invalid' as const };
      }

      const nextRawToken = createRefreshToken();
      await tx.authRefreshToken.create({
        data: {
          id_session: token.id_session,
          token_hash: hashToken(nextRawToken),
          expires_at: token.session.expires_at,
        },
      });
      return {
        kind: 'ok' as const,
        rawToken: nextRawToken,
        sessionId: token.id_session,
        user,
        deviceId: device?.id_device,
      };
    });

    if (rotation.kind === 'reused') {
      throw new UnauthorizedException({
        code: 'REFRESH_TOKEN_REUSED',
        message: 'Refresh token reuse detected; session revoked',
      });
    }
    if (rotation.kind !== 'ok') {
      throw new UnauthorizedException({
        code: 'INVALID_REFRESH_TOKEN',
        message: 'Invalid or expired refresh token',
      });
    }

    return {
      refreshToken: rotation.rawToken,
      body: this.buildAuthBody(rotation.user, rotation.sessionId, rotation.deviceId),
    };
  }

  async logout(rawToken?: string): Promise<{ success: true }> {
    if (!rawToken) return { success: true };
    const token = await this.prisma.authRefreshToken.findUnique({
      where: { token_hash: hashToken(rawToken) },
      select: { id_session: true },
    });
    if (token) await this.revokeSession(token.id_session);
    return { success: true };
  }

  async revokeUserSessions(userId: string): Promise<void> {
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const sessions = await tx.authSession.findMany({
        where: { id_user: userId },
        select: { id_session: true },
      });
      const ids = sessions.map((session) => session.id_session);
      await tx.authSession.updateMany({
        where: { id_session: { in: ids } },
        data: { revoked_at: now },
      });
      await tx.authRefreshToken.updateMany({
        where: { id_session: { in: ids } },
        data: { revoked_at: now },
      });
    });
  }

  async revokeDeviceSessions(deviceId: string): Promise<void> {
    const sessions = await this.prisma.authSession.findMany({
      where: { id_device: deviceId },
      select: { id_session: true },
    });
    await Promise.all(sessions.map((session) => this.revokeSession(session.id_session)));
  }

  async getProfile(userId: string) {
    return this.prisma.user.findUniqueOrThrow({
      where: { id_user: userId },
      select: {
        id_user: true,
        id_merchant: true,
        full_name: true,
        email: true,
        role: true,
        is_active: true,
        merchant: { select: { name: true, timezone: true } },
        created_at: true,
        updated_at: true,
      },
    });
  }

  private async createSession(user: AuthenticatedUser, deviceId?: string): Promise<AuthResult> {
    const rawToken = createRefreshToken();
    const expiresAt = new Date(Date.now() + REFRESH_TTL_MS);
    const session = await this.prisma.authSession.create({
      data: {
        id_user: user.id_user,
        id_device: deviceId,
        family_id: randomUUID(),
        expires_at: expiresAt,
        tokens: {
          create: { token_hash: hashToken(rawToken), expires_at: expiresAt },
        },
      },
    });
    return {
      refreshToken: rawToken,
      body: this.buildAuthBody(user, session.id_session, deviceId),
    };
  }

  private buildAuthBody(
    user: AuthenticatedUser,
    sessionId: string,
    deviceId?: string,
  ): AuthResult['body'] {
    const payload: JwtPayload = {
      sub: user.id_user,
      email: user.email,
      role: user.role,
      id_merchant: user.id_merchant,
      sid: sessionId,
      ...(deviceId ? { id_device: deviceId } : {}),
    };
    const accessToken = this.jwtService.sign(payload, { expiresIn: ACCESS_TTL });
    const offlineLease =
      user.role === Role.OPERATOR && deviceId
        ? this.jwtService.sign(
            { ...payload, kind: 'offline_lease' },
            {
              secret: process.env.OFFLINE_LEASE_SECRET ?? process.env.JWT_SECRET,
              expiresIn: OFFLINE_TTL,
            },
          )
        : null;
    return {
      access_token: accessToken,
      offline_lease: offlineLease,
      expires_in_seconds: 15 * 60,
      user: {
        id_user: user.id_user,
        id_merchant: user.id_merchant,
        full_name: user.full_name,
        email: user.email,
        role: user.role,
      },
    };
  }

  private async revokeSession(sessionId: string): Promise<void> {
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.authSession.updateMany({
        where: { id_session: sessionId },
        data: { revoked_at: now },
      }),
      this.prisma.authRefreshToken.updateMany({
        where: { id_session: sessionId },
        data: { revoked_at: now },
      }),
    ]);
  }
}

function createRefreshToken(): string {
  return randomBytes(48).toString('base64url');
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
