import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
  ApiParam,
} from '@nestjs/swagger';
import { PaymentsService } from './payments.service';
import type { PaymentStatusFilter } from './payments.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../common/decorators/current-user.decorator';
import { CreateReconciliationDto } from '../reconciliations/dto/create-reconciliation.dto';

@ApiTags('Payments')
@Controller('payments')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get()
  @Roles('OWNER')
  @ApiOperation({
    summary: 'List payments for the merchant (optional status filter)',
    description: 'Returns all payments for the authenticated merchant. Owner role required.',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['VERIFIED', 'FAILED'],
    description: 'Filter by payment status',
  })
  @ApiResponse({ status: 200, description: 'List of payments returned' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden — Owner role required' })
  async findAll(@CurrentUser() user: JwtPayload, @Query('status') status?: PaymentStatusFilter) {
    return this.paymentsService.findAll(user, status);
  }

  @Get(':id')
  @Roles('OWNER')
  @ApiOperation({ summary: 'Get a single payment by ID' })
  @ApiParam({ name: 'id', description: 'Payment ID' })
  @ApiResponse({ status: 200, description: 'Payment returned' })
  @ApiResponse({ status: 404, description: 'Payment not found' })
  async findOne(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.paymentsService.findOne(user, id);
  }

  @Post(':id/reconcile')
  @Roles('OWNER')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Open a reconciliation case for a payment',
    description:
      'Opens a new OPEN reconciliation case for the given payment. ' +
      'Use POST /reconciliations/:id/resolve to close it.',
  })
  @ApiParam({ name: 'id', description: 'Payment ID to reconcile' })
  @ApiResponse({ status: 201, description: 'Reconciliation case created' })
  @ApiResponse({ status: 400, description: 'Already has an open case' })
  @ApiResponse({ status: 404, description: 'Payment not found' })
  async reconcile(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: CreateReconciliationDto,
  ) {
    return this.paymentsService.reconcile(user, id, dto);
  }
}
