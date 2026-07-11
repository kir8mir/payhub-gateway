import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { WebhookSignatureGuard } from '../common/guards/webhook-signature.guard';
import { CallbackHandlerFactory } from './callback-handler.factory';
import { CallbackDto } from './dto/callback.dto';

@Controller('webhooks/psp')
@UseGuards(WebhookSignatureGuard)
export class PspCallbackController {
  constructor(private readonly callbackHandlerFactory: CallbackHandlerFactory) {}

  @Post(':provider')
  handleCallback(
    @Param('provider') provider: string,
    @Headers('x-brand-id') brandIdHeader: string | undefined,
    @Body() body: CallbackDto,
  ) {
    const brandId = Number(brandIdHeader);

    if (!Number.isInteger(brandId) || brandId <= 0) {
      throw new BadRequestException('x-brand-id header is required');
    }

    return this.callbackHandlerFactory
      .create('PSP')
      .handle(provider, brandId, body);
  }
}
