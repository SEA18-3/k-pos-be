import { Test, TestingModule } from '@nestjs/testing';
import { HealthService } from './health.service';
import { PrismaService } from '../../prisma/prisma.service';
import { InternalServerErrorException } from '@nestjs/common';

describe('HealthService', () => {
  let service: HealthService;

  const mockPrisma = {
    $queryRaw: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [HealthService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get<HealthService>(HealthService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('check', () => {
    it('should return ok', async () => {
      mockPrisma.$queryRaw.mockResolvedValueOnce([{ '?column?': 1 }]);
      const res = await service.check();
      expect(res.status).toBe('ok');
      expect(res.database).toBe('ok');
    });

    it('should throw on error', async () => {
      mockPrisma.$queryRaw.mockRejectedValueOnce(new Error('db error'));
      await expect(service.check()).rejects.toThrow(InternalServerErrorException);
    });
  });
});
