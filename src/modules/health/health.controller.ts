import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { HealthService } from './health.service';

@Controller()
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get('health')
  status() {
    return this.health.status();
  }

  @Get('metrics')
  async metrics(@Res() response: Response) {
    response.type('text/plain; version=0.0.4').send(await this.health.metrics());
  }
}
