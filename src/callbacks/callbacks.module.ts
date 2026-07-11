import { Module } from '@nestjs/common';
import { CallbackHandlerFactory } from './callback-handler.factory';
import { GspCallbackHandler } from './handlers/gsp-callback.handler';
import { PspCallbackHandler } from './handlers/psp-callback.handler';
import { PspCallbackController } from './psp-callback.controller';
import { GspCallbackController } from './gsp-callback.controller';

@Module({
  controllers: [PspCallbackController, GspCallbackController],
  providers: [CallbackHandlerFactory, PspCallbackHandler, GspCallbackHandler],
})
export class CallbacksModule {}
