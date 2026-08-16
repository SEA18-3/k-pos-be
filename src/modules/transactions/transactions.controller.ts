import { Controller, Get, Patch, Param, Body, UseGuards, Query } from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import { QueryTransactionsDto } from './dto/query-transactions.dto';
import { VoidTransactionDto } from './dto/void-transaction.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../common/decorators/current-user.decorator';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

@ApiTags('Transactions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Get()
  @Roles(Role.OWNER, Role.ADMIN, Role.OPERATOR)
  @ApiOperation({ summary: 'Get all transactions with filters and pagination' })
  @ApiResponse({ status: 200, description: 'Return list of transactions.' })
  findAll(@CurrentUser() user: JwtPayload, @Query() query: QueryTransactionsDto) {
    return this.transactionsService.findAll(user, query);
  }

  @Get(':id')
  @Roles(Role.OWNER, Role.ADMIN, Role.OPERATOR)
  @ApiOperation({ summary: 'Get a transaction by id' })
  @ApiResponse({ status: 200, description: 'Return the transaction.' })
  @ApiResponse({ status: 404, description: 'Transaction not found.' })
  findOne(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.transactionsService.findOne(user, id);
  }

  @Patch(':id/void')
  @Roles(Role.OWNER, Role.ADMIN, Role.OPERATOR)
  @ApiOperation({ summary: 'Void a PENDING transaction' })
  @ApiResponse({ status: 200, description: 'Transaction successfully voided.' })
  @ApiResponse({ status: 400, description: 'Invalid transaction status.' })
  @ApiResponse({ status: 404, description: 'Transaction not found.' })
  voidTransaction(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() voidTransactionDto: VoidTransactionDto,
  ) {
    return this.transactionsService.voidTransaction(user, id, voidTransactionDto);
  }
}
