import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomInt } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { CreateDeviceDto } from './dto/create-device.dto';
import { PairDeviceDto } from './dto/pair-device.dto';

const PAIRING_TTL_MS = 10 * 60 * 1000;

@Injectable()
export class DevicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
  ) {}

  async create(merchantId: string, actorId: string, dto: CreateDeviceDto) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const pairingCode = randomInt(100000, 1000000).toString();
      try {
        return await this.prisma.$transaction(async (tx) => {
          const device = await tx.device.create({
            data: {
              id_merchant: merchantId,
              name: dto.name.trim(),
              pairing_code: pairingCode,
              pairing_expires_at: new Date(Date.now() + PAIRING_TTL_MS),
            },
            select: {
              id_device: true,
              name: true,
              pairing_code: true,
              pairing_expires_at: true,
              status: true,
            },
          });
          await tx.auditEvent.create({
            data: {
              id_merchant: merchantId,
              id_actor: actorId,
              action: 'DEVICE_CREATED',
              entity_type: 'DEVICE',
              entity_id: device.id_device,
            },
          });
          return device;
        });
      } catch (error: unknown) {
        if (isUniqueConstraint(error)) continue;
        throw error;
      }
    }
    throw new BadRequestException({
      code: 'PAIRING_CODE_UNAVAILABLE',
      message: 'Could not allocate a pairing code',
    });
  }

  async pairDevice(dto: PairDeviceDto) {
    const device = await this.prisma.device.findUnique({
      where: { pairing_code: dto.pairing_code },
    });
    if (
      !device ||
      !device.is_active ||
      device.status !== 'UNPAIRED' ||
      !device.pairing_expires_at ||
      device.pairing_expires_at <= new Date()
    ) {
      throw new BadRequestException({
        code: 'INVALID_PAIRING_CODE',
        message: 'Pairing code is invalid or expired',
      });
    }

    const deviceIdHash = createHash('sha256').update(dto.hardware_id).digest('hex');
    try {
      return await this.prisma.$transaction(async (tx) => {
        const updated = await tx.device.update({
          where: { id_device: device.id_device },
          data: {
            device_id_hash: deviceIdHash,
            pairing_code: null,
            pairing_expires_at: null,
            status: 'PAIRED',
            last_online_at: new Date(),
          },
          select: { id_device: true, name: true, status: true },
        });
        await tx.auditEvent.create({
          data: {
            id_merchant: device.id_merchant,
            action: 'DEVICE_PAIRED',
            entity_type: 'DEVICE',
            entity_id: device.id_device,
          },
        });
        return updated;
      });
    } catch (error: unknown) {
      if (isUniqueConstraint(error)) {
        throw new BadRequestException({
          code: 'HARDWARE_ALREADY_PAIRED',
          message: 'Hardware is already paired for this merchant',
        });
      }
      throw error;
    }
  }

  findAll(merchantId: string) {
    return this.prisma.device.findMany({
      where: { id_merchant: merchantId },
      select: {
        id_device: true,
        name: true,
        status: true,
        is_active: true,
        pairing_code: true,
        pairing_expires_at: true,
        last_online_at: true,
        last_sync_at: true,
        created_at: true,
      },
      orderBy: { created_at: 'desc' },
    });
  }

  async remove(deviceId: string, merchantId: string, actorId: string) {
    const device = await this.prisma.device.findFirst({
      where: { id_device: deviceId, id_merchant: merchantId },
    });
    if (!device)
      throw new NotFoundException({ code: 'DEVICE_NOT_FOUND', message: 'Device not found' });

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.device.update({
        where: { id_device: deviceId },
        data: { is_active: false, status: 'REVOKED', pairing_code: null, pairing_expires_at: null },
        select: { id_device: true, status: true, is_active: true },
      });
      await tx.auditEvent.create({
        data: {
          id_merchant: merchantId,
          id_actor: actorId,
          action: 'DEVICE_REVOKED',
          entity_type: 'DEVICE',
          entity_id: deviceId,
        },
      });
      return result;
    });
    await this.auth.revokeDeviceSessions(deviceId);
    return updated;
  }
}

function isUniqueConstraint(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}
