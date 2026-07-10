import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { compare, hash } from 'bcryptjs';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtPayload } from './jwt-payload.interface';
import { SessionsRepository } from './sessions.repository';
import { UsersRepository } from './users.repository';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly sessionsRepository: SessionsRepository,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const existingUser = await this.usersRepository.findByEmail(
      dto.email,
      dto.brandId,
    );

    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    const passwordHash = await hash(dto.password, 10);
    const user = await this.usersRepository.createUser(
      dto.email,
      passwordHash,
      dto.brandId,
    );

    return {
      id: user.id,
      email: user.email,
      brandId: user.brandId,
      createdAt: user.createdAt,
    };
  }

  async login(dto: LoginDto) {
    const user = await this.usersRepository.findByEmail(
      dto.email,
      dto.brandId,
    );

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordMatches = await compare(dto.password, user.passwordHash);

    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      brandId: user.brandId,
    };

    const accessToken = await this.jwtService.signAsync(payload);
    const decodedToken = this.jwtService.decode(accessToken) as {
      exp?: number;
    };
    const expiresAt = new Date((decodedToken.exp ?? 0) * 1000);

    await this.sessionsRepository.createSession(
      user.id,
      accessToken,
      expiresAt,
    );

    return { accessToken };
  }

  async me(userId: number, brandId: number) {
    const user = await this.usersRepository.findById(userId, brandId);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return {
      id: user.id,
      email: user.email,
      brandId: user.brandId,
      createdAt: user.createdAt,
    };
  }
}
