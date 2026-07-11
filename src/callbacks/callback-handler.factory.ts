import { Injectable } from '@nestjs/common';
import { CallbackHandler, ProviderType } from './handlers/callback-handler';
import { GspCallbackHandler } from './handlers/gsp-callback.handler';
import { PspCallbackHandler } from './handlers/psp-callback.handler';

@Injectable()
export class CallbackHandlerFactory {
  constructor(
    private readonly pspCallbackHandler: PspCallbackHandler,
    private readonly gspCallbackHandler: GspCallbackHandler,
  ) {}

  create(providerType: ProviderType): CallbackHandler {
    switch (providerType) {
      case 'PSP':
        return this.pspCallbackHandler;
      case 'GSP':
        return this.gspCallbackHandler;
    }
  }
}
