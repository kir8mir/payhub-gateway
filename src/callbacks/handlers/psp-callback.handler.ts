import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../persistence/prisma/prisma.service';
import { CallbackHandler, ProviderType } from './callback-handler';

@Injectable()
export class PspCallbackHandler extends CallbackHandler {
  protected readonly providerType: ProviderType = 'PSP';

  constructor(prisma: PrismaService) {
    super(prisma);
  }
}
