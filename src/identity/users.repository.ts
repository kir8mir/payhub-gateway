import { Injectable } from '@nestjs/common';
import { PrismaService } from '../persistence/prisma/prisma.service';

@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
    });
  }

  findById(id: number) {
    return this.prisma.user.findUnique({
      where: { id },
    });
  }

  createUser(email: string, passwordHash: string, brandId: number) {
    return this.prisma.user.create({
      data: {
        email,
        passwordHash,
        brandId,
      },
    });
  }
}
