import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  Param,
  Post,
} from '@nestjs/common';
import { CallbackService } from './callback.service';
import { CallbackDto } from './dto/callback.dto';

@Controller('webhooks/gsp')
export class GspCallbackController {
  constructor(private readonly callbackService: CallbackService) {}

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

    return this.callbackService.handleGspCallback(provider, brandId, body);
  }
}
