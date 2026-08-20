import { JwtStrategy } from './jwt.strategy';
import { PrismaService } from '../../../prisma/prisma.service';

describe('JwtStrategy', () => {
  beforeAll(() => {
    process.env.JWT_SECRET = 'secret';
  });

  it('should validate and return payload', async () => {
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ is_active: true }) },
    } as any;
    const strategy = new JwtStrategy(prisma);
    const payload = { sub: '1', email: 'test', role: 'ADMIN' };
    const res = await strategy.validate(payload as any);
    expect(res.sub).toBe('1');
  });

  it('should throw error if user inactive', async () => {
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ is_active: false }) },
    } as any;
    const strategy = new JwtStrategy(prisma);
    const payload = { sub: '1', email: 'test', role: 'ADMIN' };
    await expect(strategy.validate(payload as any)).rejects.toThrow();
  });
});
