import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateUserDto } from './dto/create-user.dto';

const base = {
  full_name: 'Kasir Baru',
  email: 'kasir@example.test',
  password: 'password123',
};

describe('managed user role policy', () => {
  it.each(['OPERATOR', 'ENTRY'])('accepts %s provisioning by Owner', async (role) => {
    const result = await validate(plainToInstance(CreateUserDto, { ...base, role }));
    expect(result).toHaveLength(0);
  });

  it('rejects provisioning another Owner through the HTTP DTO', async () => {
    const result = await validate(plainToInstance(CreateUserDto, { ...base, role: 'OWNER' }));
    expect(result.some((error) => error.property === 'role')).toBe(true);
  });
});
