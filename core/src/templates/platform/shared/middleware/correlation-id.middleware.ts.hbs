import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'crypto';

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
use(req: any, res: any, next: () => void) {
const incoming = req.headers['x-correlation-id'];
const id = typeof incoming === 'string' && incoming.length ? incoming : randomUUID();

req.headers['x-correlation-id'] = id;
res.setHeader('X-Correlation-Id', id);

next();
}
}