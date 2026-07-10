import { Module } from '@nestjs/common';
import { PspCallbackController } from './psp-callback.controller';
import { GspCallbackController } from './gsp-callback.controller';
import { CallbackService } from './callback.service';

@Module({
  controllers: [PspCallbackController, GspCallbackController],
  providers: [CallbackService],
})
export class CallbacksModule {}
