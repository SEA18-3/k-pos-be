import { Test, TestingModule } from '@nestjs/testing';
import { DevicesService } from './devices.service';
import { PrismaService } from '../../prisma/prisma.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import * as crypto from 'crypto';

describe('DevicesService', () => {
  let service: DevicesService;
  let prisma: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DevicesService,
        {
          provide: PrismaService,
          useValue: {
            device: {
              create: jest.fn(),
              findUnique: jest.fn(),
              findFirst: jest.fn(),
              findMany: jest.fn(),
              update: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<DevicesService>(DevicesService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a new device and return it', async () => {
      const dto = { name: 'Tablet 1' };
      const mockResult = { id_device: 'dev-1', pairing_code: '123456', status: 'UNPAIRED' };
      (prisma.device.create as jest.Mock).mockResolvedValue(mockResult);

      const result = await service.create('mrc-1', 'usr-1', dto);

      expect(prisma.device.create).toHaveBeenCalled();
      expect(result).toEqual(mockResult);
    });
  });

  describe('pairDevice', () => {
    it('should successfully pair a device', async () => {
      const dto = { pairing_code: '123456', hardware_id: 'hw-123' };
      const mockDevice = { id_device: 'dev-1', pairing_code: '123456', status: 'UNPAIRED' };

      (prisma.device.findUnique as jest.Mock).mockResolvedValue(mockDevice);
      (prisma.device.update as jest.Mock).mockResolvedValue({
        id_device: 'dev-1',
        status: 'PAIRED',
      });

      const result = await service.pairDevice(dto);

      expect(prisma.device.findUnique).toHaveBeenCalledWith({ where: { pairing_code: '123456' } });
      expect(prisma.device.update).toHaveBeenCalled();

      // Verify hash logic
      const expectedHash = crypto.createHash('sha256').update('hw-123').digest('hex');
      expect(prisma.device.update).toHaveBeenCalledWith({
        where: { id_device: 'dev-1' },
        data: {
          device_id_hash: expectedHash,
          pairing_code: null,
          status: 'PAIRED',
        },
        select: {
          id_device: true,
          status: true,
        },
      });

      expect(result).toEqual({ id_device: 'dev-1', status: 'PAIRED' });
    });

    it('should throw BadRequestException if code is invalid', async () => {
      const dto = { pairing_code: '123456', hardware_id: 'hw-123' };
      (prisma.device.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.pairDevice(dto)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if hardware_id is duplicate in merchant', async () => {
      const dto = { pairing_code: '123456', hardware_id: 'hw-123' };
      const mockDevice = { id_device: 'dev-1', pairing_code: '123456', status: 'UNPAIRED' };

      (prisma.device.findUnique as jest.Mock).mockResolvedValue(mockDevice);

      const p2002Error = new Error('Unique constraint') as Error & { code: string };
      p2002Error.code = 'P2002';
      (prisma.device.update as jest.Mock).mockRejectedValue(p2002Error);

      await expect(service.pairDevice(dto)).rejects.toThrow(BadRequestException);
    });
  });

  describe('findAll', () => {
    it('should return array of devices', async () => {
      const mockResult = [{ id_device: 'dev-1', name: 'Tab 1' }];
      (prisma.device.findMany as jest.Mock).mockResolvedValue(mockResult);

      const result = await service.findAll('mrc-1');
      expect(prisma.device.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id_merchant: 'mrc-1', is_active: true },
        }),
      );
      expect(result).toEqual(mockResult);
    });
  });

  describe('remove', () => {
    it('should revoke a device', async () => {
      const mockDevice = { id_device: 'dev-1', id_merchant: 'mrc-1', is_active: true };
      (prisma.device.findFirst as jest.Mock).mockResolvedValue(mockDevice);
      (prisma.device.update as jest.Mock).mockResolvedValue({
        id_device: 'dev-1',
        status: 'REVOKED',
        is_active: false,
      });

      const result = await service.remove('dev-1', 'mrc-1');

      expect(prisma.device.findFirst).toHaveBeenCalled();
      expect(prisma.device.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id_device: 'dev-1' },
          data: { is_active: false, status: 'REVOKED' },
        }),
      );
      expect(result).toBeDefined();
    });

    it('should throw NotFoundException if device not found', async () => {
      (prisma.device.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(service.remove('dev-1', 'mrc-1')).rejects.toThrow(NotFoundException);
    });
  });
});
