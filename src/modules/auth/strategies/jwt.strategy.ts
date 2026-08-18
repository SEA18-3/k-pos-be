import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { JwtPayload } from '../../../common/decorators/current-user.decorator';

import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private prisma: PrismaService) {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error('JWT_SECRET is not defined in environment variables');
    }
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  /**
   * Method ini dipanggil otomatis setelah JWT berhasil diverifikasi.
   * Return value akan diinject ke request.user.
   */
  async validate(payload: JwtPayload): Promise<JwtPayload> {
    const session = await this.prisma.authSession.findFirst({
      where: {
        id_session: payload.sid,
        id_user: payload.sub,
        revoked_at: null,
        expires_at: { gt: new Date() },
      },
      include: { user: true, device: true },
    });

    if (!session || !session.user.is_active) {
      throw new UnauthorizedException({
        code: 'SESSION_REVOKED',
        message: 'Session is inactive or expired',
      });
    }
    if (
      session.user.role === 'OPERATOR' &&
      (!session.device || !session.device.is_active || session.device.status !== 'PAIRED')
    ) {
      throw new UnauthorizedException({
        code: 'DEVICE_REVOKED',
        message: 'Operator device is no longer active',
      });
    }

    return {
      sub: session.user.id_user,
      email: session.user.email,
      role: session.user.role,
      id_merchant: session.user.id_merchant,
      sid: session.id_session,
      ...(session.device?.id_device ? { id_device: session.device.id_device } : {}),
    };
  }
}
