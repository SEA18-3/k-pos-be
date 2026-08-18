import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  async check() {
    try {
      // Jalankan query sangat ringan ke database
      await this.prisma.$queryRaw`SELECT 1`;
      return {
        status: 'ok',
        database: 'ok',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      throw new InternalServerErrorException({
        status: 'error',
        database: 'disconnected',
        error: error.message,
      });
    }
  }
}
