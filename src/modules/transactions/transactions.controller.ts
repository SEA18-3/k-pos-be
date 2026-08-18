import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, type JwtPayload } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CorrectTransactionDto } from './dto/correct-transaction.dto';
import { QueryTransactionsDto } from './dto/query-transactions.dto';
import { ResolveConflictDto } from './dto/resolve-conflict.dto';
import { VoidTransactionDto } from './dto/void-transaction.dto';
import { TransactionsService } from './transactions.service';

@ApiTags('Transactions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactions: TransactionsService) {}

  @Get()
  @Roles(Role.OWNER, Role.ENTRY, Role.OPERATOR)
  findAll(@CurrentUser() user: JwtPayload, @Query() query: QueryTransactionsDto) {
    return this.transactions.findAll(user, query);
  }

  @Get(':id')
  @Roles(Role.OWNER, Role.ENTRY, Role.OPERATOR)
  findOne(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.transactions.findOne(user, id);
  }

  @Post(':id/void')
  @Roles(Role.OWNER)
  void(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: VoidTransactionDto) {
    return this.transactions.voidTransaction(user, id, dto);
  }

  @Post(':id/conflict-resolution')
  @Roles(Role.OWNER)
  resolveConflict(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: ResolveConflictDto,
  ) {
    return this.transactions.resolveConflict(user, id, dto);
  }

  @Post(':id/resolve')
  @Roles(Role.OWNER)
  resolveConflictCompatibility(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: ResolveConflictDto,
  ) {
    return this.transactions.resolveConflict(user, id, dto);
  }

  @Post(':id/corrections')
  @Roles(Role.OWNER)
  correct(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: CorrectTransactionDto,
  ) {
    return this.transactions.correctTransaction(user, id, dto);
  }

  @Post(':id/correct')
  @Roles(Role.OWNER)
  correctCompatibility(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: CorrectTransactionDto,
  ) {
    return this.transactions.correctTransaction(user, id, dto);
  }
}
