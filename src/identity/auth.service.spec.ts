import { ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { hash } from 'bcryptjs';
import { AuthService } from './auth.service';
import { SessionsRepository } from './sessions.repository';
import { UsersRepository } from './users.repository';

describe('AuthService', () => {
  const brandId = 1;

  let usersRepository: {
    findByEmail: jest.Mock;
    findById: jest.Mock;
    createUser: jest.Mock;
  };
  let sessionsRepository: { createSession: jest.Mock };
  let jwtService: { signAsync: jest.Mock; decode: jest.Mock };
  let service: AuthService;

  beforeEach(() => {
    usersRepository = {
      findByEmail: jest.fn(),
      findById: jest.fn(),
      createUser: jest.fn(),
    };
    sessionsRepository = { createSession: jest.fn() };
    jwtService = { signAsync: jest.fn(), decode: jest.fn() };

    service = new AuthService(
      usersRepository as unknown as UsersRepository,
      sessionsRepository as unknown as SessionsRepository,
      jwtService as unknown as JwtService,
    );
  });

  describe('register', () => {
    it('rejects registration when the email is already taken within the same brand', async () => {
      usersRepository.findByEmail.mockResolvedValue({
        id: 1,
        email: 'a@a.com',
        brandId,
      });

      await expect(
        service.register({ email: 'a@a.com', password: 'password123', brandId }),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(usersRepository.findByEmail).toHaveBeenCalledWith('a@a.com', brandId);
      expect(usersRepository.createUser).not.toHaveBeenCalled();
    });

    it('allows the same email to be registered under a different brand', async () => {
      usersRepository.findByEmail.mockResolvedValue(null);
      usersRepository.createUser.mockResolvedValue({
        id: 2,
        email: 'a@a.com',
        brandId: 2,
        passwordHash: 'hashed',
        createdAt: new Date(),
      });

      const result = await service.register({
        email: 'a@a.com',
        password: 'password123',
        brandId: 2,
      });

      expect(usersRepository.findByEmail).toHaveBeenCalledWith('a@a.com', 2);
      expect(result).not.toHaveProperty('passwordHash');
      expect(result.brandId).toBe(2);
    });

    it('stores a bcrypt hash, never the plaintext password', async () => {
      usersRepository.findByEmail.mockResolvedValue(null);
      usersRepository.createUser.mockImplementation((email, passwordHash, brand) =>
        Promise.resolve({ id: 1, email, passwordHash, brandId: brand, createdAt: new Date() }),
      );

      await service.register({ email: 'a@a.com', password: 'password123', brandId });

      const [, storedHash] = usersRepository.createUser.mock.calls[0];
      expect(storedHash).not.toBe('password123');
      expect(storedHash).toMatch(/^\$2[aby]\$/);
    });
  });

  describe('login', () => {
    it('rejects with a generic error when the user does not exist', async () => {
      usersRepository.findByEmail.mockResolvedValue(null);

      await expect(
        service.login({ email: 'nobody@a.com', password: 'password123', brandId }),
      ).rejects.toThrow('Invalid credentials');
    });

    it('rejects with the same generic error when the password is wrong (does not leak which check failed)', async () => {
      const passwordHash = await hash('correct-password', 10);
      usersRepository.findByEmail.mockResolvedValue({
        id: 1,
        email: 'a@a.com',
        brandId,
        passwordHash,
      });

      await expect(
        service.login({ email: 'a@a.com', password: 'wrong-password', brandId }),
      ).rejects.toThrow('Invalid credentials');
    });

    it('issues a token and persists a session on valid credentials', async () => {
      const passwordHash = await hash('correct-password', 10);
      usersRepository.findByEmail.mockResolvedValue({
        id: 1,
        email: 'a@a.com',
        brandId,
        passwordHash,
      });
      jwtService.signAsync.mockResolvedValue('signed.jwt.token');
      const exp = Math.floor(Date.now() / 1000) + 3600;
      jwtService.decode.mockReturnValue({ exp });

      const result = await service.login({
        email: 'a@a.com',
        password: 'correct-password',
        brandId,
      });

      expect(result).toEqual({ accessToken: 'signed.jwt.token' });
      expect(sessionsRepository.createSession).toHaveBeenCalledWith(
        1,
        'signed.jwt.token',
        new Date(exp * 1000),
      );
    });
  });
});
