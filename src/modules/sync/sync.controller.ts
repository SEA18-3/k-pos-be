import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, type JwtPayload } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { SyncBatchDto } from './dto/sync-batch.dto';
import { SyncService } from './sync.service';

@ApiTags('Sync')
@ApiBearerAuth()
@Controller('sync')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SyncController {
  constructor(private readonly sync: SyncService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @Roles(Role.OPERATOR)
  @ApiOperation({
    summary: 'Durably queue an offline transaction batch; 200 does not mean settled',
  })
  accept(
    @CurrentUser() user: JwtPayload,
    @Headers('x-device-id') deviceId: string | undefined,
    @Body() batch: SyncBatchDto,
  ) {
    return this.sync.accept(user, deviceId, batch);
  }

  @Get('receipts')
  @Roles(Role.OPERATOR, Role.OWNER)
  getReceipts(
    @CurrentUser() user: JwtPayload,
    @Query('offline_uuid') query: string | string[] | undefined,
  ) {
    return this.sync.getReceipts(user, query ? (Array.isArray(query) ? query : [query]) : []);
  }

  @Get('failures')
  @Roles(Role.OWNER)
  @ApiOperation({ summary: 'List terminal sync failures and stock conflicts for Owner action' })
  getFailures(@CurrentUser() user: JwtPayload) {
    return this.sync.getFailures(user);
  }

  @Post('receipts/:id/retry')
  @Roles(Role.OWNER)
  retry(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.sync.retry(user, id);
  }
}
