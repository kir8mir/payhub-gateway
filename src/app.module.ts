import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module';
import { IdentityModule } from './identity/identity.module';
import { PrismaModule } from './persistence/prisma/prisma.module';

@Module({
  imports: [HealthModule, PrismaModule, IdentityModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
