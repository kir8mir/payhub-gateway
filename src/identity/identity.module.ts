import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { ProfileController } from './profile.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { SessionsRepository } from './sessions.repository';
import { UsersRepository } from './users.repository';

@Module({
  imports: [
    PassportModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET,
      signOptions: { expiresIn: '1h' },
    }),
  ],
  controllers: [AuthController, ProfileController],
  providers: [AuthService, UsersRepository, SessionsRepository, JwtStrategy],
})
export class IdentityModule {}
