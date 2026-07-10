import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module';
import { IdentityModule } from './identity/identity.module';
import { PrismaModule } from './persistence/prisma/prisma.module';
import { PspCallbackController } from './callbacks/psp-callback.controller';
import { GspCallbackController } from './callbacks/gsp-callback.controller';
import { CallbackService } from './callbacks/callback.service';

@Module({
  imports: [HealthModule, PrismaModule, IdentityModule],
  controllers: [PspCallbackController, GspCallbackController],
  providers: [CallbackService],
})
export class AppModule {}
