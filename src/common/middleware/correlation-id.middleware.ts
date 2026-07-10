import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { CORRELATION_ID_HEADER } from '../interceptors/correlation-id.interceptor';

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction): void {
    const existing = req.headers[CORRELATION_ID_HEADER] as string | undefined;
    req.headers[CORRELATION_ID_HEADER] = existing ?? randomUUID();
    next();
  }
}
