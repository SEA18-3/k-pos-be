import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
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
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.login(dto);
    res.cookie('refreshToken', result.refresh_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    return {
      access_token: result.access_token,
      user: result.user,
    };
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
    description: 'Refresh token dibaca otomatis melalui HttpOnly cookie.',
  })
  @ApiResponse({ status: 200, description: 'Access token baru dikembalikan' })
  @ApiResponse({
    status: 401,
    description: 'Refresh token tidak valid, kadaluarsa, atau tidak ada',
  })
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken = req.cookies?.refreshToken as string | undefined;
    if (!refreshToken) {
      throw new UnauthorizedException('Missing refresh token cookie');
    }
    const result = await this.authService.refresh(refreshToken);
    res.cookie('refreshToken', result.refresh_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    return { access_token: result.access_token };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Logout dan hapus refresh token',
    description: 'Menghapus sesi dan cookie refresh token.',
  })
  @ApiResponse({ status: 200, description: 'Logout berhasil' })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken = req.cookies?.refreshToken as string | undefined;
    if (refreshToken) {
      await this.authService.logout(refreshToken);
    }
    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
    });
    return { success: true };
  }
}
