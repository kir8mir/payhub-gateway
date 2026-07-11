import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../persistence/prisma/prisma.service';
import { CallbackHandler, ProviderType } from './callback-handler';

@Injectable()
export class GspCallbackHandler extends CallbackHandler {
  protected readonly providerType: ProviderType = 'GSP';

  constructor(prisma: PrismaService) {
    super(prisma);
  }
}
