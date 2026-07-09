import { Injectable } from '@nestjs/common';
import { PrismaService } from '../persistence/prisma/prisma.service';

@Injectable()
export class SessionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  createSession(userId: number, token: string, expiresAt: Date) {
    return this.prisma.session.create({
      data: {
        userId,
        token,
        expiresAt,
      },
    });
  }
}
