import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, type JwtPayload } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import {
  OpenPaymentReconciliationDto,
  ResolvePaymentReconciliationDto,
} from './dto/reconciliation.dto';
import { PaymentsService } from './payments.service';

@ApiTags('Payments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.OWNER)
@Controller()
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get('payments')
  findAll(@CurrentUser() user: JwtPayload, @Query('status') status?: string) {
    return this.payments.findAll(user, status);
  }

  @Post('payments/:id/reconciliations')
  open(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: OpenPaymentReconciliationDto,
  ) {
    return this.payments.open(user, id, dto);
  }

  @Get('payment-reconciliations')
  list(@CurrentUser() user: JwtPayload, @Query('status') status?: string) {
    return this.payments.listReconciliations(user, status);
  }

  @Post('payment-reconciliations/:id/resolve')
  resolve(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: ResolvePaymentReconciliationDto,
  ) {
    return this.payments.resolve(user, id, dto);
  }
}
