import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { CreateDeviceDto } from './dto/create-device.dto';
import { PairDeviceDto } from './dto/pair-device.dto';
import { PrismaService } from '../../prisma/prisma.service';
import * as crypto from 'crypto';

@Injectable()
export class DevicesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(id_merchant: string, id_user: string, createDeviceDto: CreateDeviceDto) {
    // Generate 6 digit numeric code
    const pairing_code = Math.floor(100000 + Math.random() * 900000).toString();

    const device = await this.prisma.device.create({
      data: {
        id_merchant,
        id_user,
        name: createDeviceDto.name,
        pairing_code,
        status: 'UNPAIRED',
      },
      select: {
        id_device: true,
        pairing_code: true,
        status: true,
      },
    });

    return device;
  }

  async pairDevice(pairDeviceDto: PairDeviceDto) {
    const { pairing_code, hardware_id } = pairDeviceDto;

    // Find device by pairing code
    const device = await this.prisma.device.findUnique({
      where: { pairing_code },
    });

    if (!device) {
      throw new BadRequestException('Invalid pairing code or device already paired');
    }

    if (device.status !== 'UNPAIRED') {
      throw new BadRequestException('Device is already paired or revoked');
    }

    // Hash hardware_id using SHA-256
    const device_id_hash = crypto.createHash('sha256').update(hardware_id).digest('hex');

    try {
      // Update device
      const updatedDevice = await this.prisma.device.update({
        where: { id_device: device.id_device },
        data: {
          device_id_hash,
          pairing_code: null,
          status: 'PAIRED',
        },
        select: {
          id_device: true,
          status: true,
        },
      });

      return updatedDevice;
    } catch (error: unknown) {
      // Handle Prisma unique constraint error if same device_id_hash is used in the same merchant
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'P2002'
      ) {
        throw new BadRequestException('Hardware ID is already registered for this merchant');
      }
      throw error;
    }
  }

  async findAll(id_merchant: string) {
    return this.prisma.device.findMany({
      where: {
        id_merchant,
        is_active: true,
      },
      select: {
        id_device: true,
        name: true,
        status: true,
        last_online_at: true,
        created_at: true,
      },
      orderBy: {
        created_at: 'desc',
      },
    });
  }

  async remove(id_device: string, id_merchant: string) {
    const device = await this.prisma.device.findFirst({
      where: {
        id_device,
        id_merchant,
        is_active: true,
      },
    });

    if (!device) {
      throw new NotFoundException('Device not found or already removed');
    }

    const updatedDevice = await this.prisma.device.update({
      where: { id_device },
      data: {
        is_active: false,
        status: 'REVOKED',
      },
      select: {
        id_device: true,
        status: true,
        is_active: true,
      },
    });

    // Revoke all refresh tokens for the user associated with this device
    // to force them to log in again if their device was revoked.
    if (device.id_user) {
      await this.prisma.refreshToken.deleteMany({
        where: { id_user: device.id_user },
      });
    }

    return updatedDevice;
  }
}
