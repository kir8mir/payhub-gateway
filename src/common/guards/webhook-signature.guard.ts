import {
  CanActivate,
  ExecutionContext,
  Injectable,
  RawBodyRequest,
  UnauthorizedException,
} from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { Request } from 'express';

export const WEBHOOK_SIGNATURE_HEADER = 'x-webhook-signature';

@Injectable()
export class WebhookSignatureGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RawBodyRequest<Request>>();
    const signature = request.headers[WEBHOOK_SIGNATURE_HEADER] as
      | string
      | undefined;

    if (!signature || !request.rawBody) {
      throw new UnauthorizedException('Missing webhook signature');
    }

    const secret = process.env.WEBHOOK_SECRET;

    if (!secret) {
      throw new Error('WEBHOOK_SECRET is not set');
    }

    const expected = createHmac('sha256', secret)
      .update(request.rawBody)
      .digest('hex');

    const expectedBuffer = Buffer.from(expected, 'hex');
    const signatureBuffer = Buffer.from(signature, 'hex');

    if (
      expectedBuffer.length !== signatureBuffer.length ||
      !timingSafeEqual(expectedBuffer, signatureBuffer)
    ) {
      throw new UnauthorizedException('Invalid webhook signature');
    }

    return true;
  }
}
