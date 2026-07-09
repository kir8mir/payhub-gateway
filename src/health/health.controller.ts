import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  constructor() {}

  @Get()
  checkHealth(): { status: string; message: string } {
    return { status: 'ok', message: 'Service is healthy' };
  }
}
