import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../common/decorators/current-user.decorator';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @ApiOperation({
    summary:
      'Register OWNER baru (self-serve onboarding). OPERATOR/ENTRY dibuat oleh OWNER via POST /users.',
  })
  @ApiResponse({ status: 201, description: 'OWNER berhasil terdaftar' })
  @ApiResponse({ status: 409, description: 'Email sudah terdaftar' })
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login dan dapatkan JWT access token' })
  @ApiResponse({ status: 200, description: 'Login berhasil, token dikembalikan' })
  @ApiResponse({ status: 401, description: 'Email atau password salah' })
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Dapatkan profil user yang sedang login' })
  @ApiResponse({ status: 200, description: 'Data profil user' })
  @ApiResponse({ status: 401, description: 'Token tidak valid atau tidak ada' })
  async getProfile(@CurrentUser() user: JwtPayload) {
    return this.authService.getProfile(user.sub);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Dapatkan access token baru menggunakan refresh token',
    description:
      'Refresh token dikirim melalui header `x-refresh-token`. Tidak memerlukan Bearer token dan tidak menerima body.',
  })
  @ApiHeader({
    name: 'x-refresh-token',
    description: 'Refresh token aktif',
    required: true,
  })
  @ApiResponse({ status: 200, description: 'Access token baru dikembalikan' })
  @ApiResponse({
    status: 401,
    description: 'Refresh token tidak valid, kadaluarsa, atau tidak ada',
  })
  async refresh(@Headers('x-refresh-token') refreshToken?: string) {
    if (!refreshToken) {
      throw new UnauthorizedException('Missing refresh token');
    }
    return this.authService.refresh(refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Logout dan hapus refresh token',
    description:
      'Refresh token dikirim melalui header `x-refresh-token`. Tidak memerlukan Bearer token dan tidak menerima body.',
  })
  @ApiHeader({
    name: 'x-refresh-token',
    description: 'Refresh token aktif',
    required: true,
  })
  @ApiResponse({ status: 200, description: 'Logout berhasil' })
  @ApiResponse({ status: 401, description: 'Refresh token tidak ada' })
  async logout(@Headers('x-refresh-token') refreshToken?: string) {
    if (!refreshToken) {
      throw new UnauthorizedException('Missing refresh token');
    }
    return this.authService.logout(refreshToken);
  }
}
