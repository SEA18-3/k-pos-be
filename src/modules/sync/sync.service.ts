import { Injectable } from '@nestjs/common';
import { CreateSyncDto } from './dto/create-sync.dto';
import { UpdateSyncDto } from './dto/update-sync.dto';

@Injectable()
export class SyncService {
  create(createSyncDto: CreateSyncDto) {
    return 'This action adds a new sync';
  }

  findAll() {
    return `This action returns all sync`;
  }

  findOne(id: number) {
    return `This action returns a #${id} sync`;
  }

  update(id: number, updateSyncDto: UpdateSyncDto) {
    return `This action updates a #${id} sync`;
  }

  remove(id: number) {
    return `This action removes a #${id} sync`;
  }
}
