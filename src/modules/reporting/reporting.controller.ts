import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, type JwtPayload } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ReportingService } from './reporting.service';

@ApiTags('Owner')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.OWNER)
@Controller()
export class ReportingController {
  constructor(private readonly reporting: ReportingService) {}

  @Get('owner/dashboard')
  dashboard(
    @CurrentUser() user: JwtPayload,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.reporting.dashboard(user, from, to);
  }

  @Get('audit-events')
  auditEvents(@CurrentUser() user: JwtPayload, @Query('cursor') cursor?: string) {
    return this.reporting.auditEvents(user, cursor);
  }
}
