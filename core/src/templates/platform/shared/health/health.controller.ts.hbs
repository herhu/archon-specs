import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { HealthService } from './health.service';

@Controller('health')
export class HealthController {
constructor(private readonly health: HealthService) {}

@Get()
liveness() {
return { status: 'ok' };
}

@Get('ready')
async readiness() {
const ok = await this.health.dbReady();
if (!ok) throw new ServiceUnavailableException('Database not ready');
return { status: 'ok' };
}
}