import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AuthService } from './auth.service';
import { JwtPayload } from './jwt-payload.interface';

@Controller('profile')
export class ProfileController {
  constructor(private readonly authService: AuthService) {}

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@Req() req: Request & { user: JwtPayload }) {
    return this.authService.me(req.user.sub);
  }
}
