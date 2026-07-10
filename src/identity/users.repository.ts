import { Injectable } from '@nestjs/common';
import { PrismaService } from '../persistence/prisma/prisma.service';

@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByEmail(email: string, brandId: number) {
    return this.prisma.user.findUnique({
      where: { email_brandId: { email, brandId } },
    });
  }

  findById(id: number, brandId: number) {
    return this.prisma.user.findFirst({
      where: { id, brandId },
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
