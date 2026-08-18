import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Guard yang memvalidasi JWT Bearer token.
 * Gunakan di endpoint yang membutuhkan autentikasi.
 * @example
 * @UseGuards(JwtAuthGuard)
 * @Get('profile')
 * getProfile() { ... }
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
