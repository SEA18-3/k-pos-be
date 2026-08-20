import { RolesGuard } from './roles.guard';
import { Reflector } from '@nestjs/core';
import { ExecutionContext } from '@nestjs/common';

describe('RolesGuard', () => {
  it('should return true if no roles required', () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(undefined) } as any;
    const guard = new RolesGuard(reflector);
    expect(guard.canActivate({ getHandler: jest.fn(), getClass: jest.fn() } as any)).toBe(true);
  });

  it('should check roles if required', () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(['ADMIN']) } as any;
    const guard = new RolesGuard(reflector);
    const mockContext = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue({ user: { role: 'ADMIN' } }),
      }),
    } as any;
    expect(guard.canActivate(mockContext)).toBe(true);
  });
});
