import { Prisma } from '@prisma/client';
import { PrismaService } from '../../persistence/prisma/prisma.service';
import { CallbackDto } from '../dto/callback.dto';
import { PspCallbackHandler } from './psp-callback.handler';

describe('PspCallbackHandler', () => {
  const brandId = 1;
  const provider = 'stripe';
  const dto: CallbackDto = { webhookId: 'evt_123', payload: { amount: 100 } };

  let prisma: {
    idempotencyKey: { findUnique: jest.Mock; create: jest.Mock };
    rawWebhook: { create: jest.Mock };
    $transaction: jest.Mock;
  };
  let handler: PspCallbackHandler;

  beforeEach(() => {
    prisma = {
      idempotencyKey: { findUnique: jest.fn(), create: jest.fn() },
      rawWebhook: { create: jest.fn() },
      $transaction: jest.fn(),
    };
    handler = new PspCallbackHandler(prisma as unknown as PrismaService);
  });

  it('persists idempotencyKey + rawWebhook and returns status "created" on first call', async () => {
    prisma.idempotencyKey.findUnique.mockResolvedValue(null);
    prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
      fn({
        idempotencyKey: { create: jest.fn().mockResolvedValue({}) },
        rawWebhook: { create: jest.fn().mockResolvedValue({}) },
      }),
    );

    const result = await handler.handle(provider, brandId, dto);

    expect(result.status).toBe('created');
    expect(result.accepted).toBe(true);
    expect(result.idempotencyKey).toBe(dto.webhookId);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('returns the cached response with status "duplicated" without re-inserting on a repeated call', async () => {
    const storedResponse = {
      providerType: 'PSP',
      provider,
      brandId,
      idempotencyKey: `PSP:${provider}:${dto.webhookId}`,
      status: 'created',
      accepted: true,
    };
    prisma.idempotencyKey.findUnique.mockResolvedValue({ storedResponse });

    const result = await handler.handle(provider, brandId, dto);

    expect(result).toEqual({ ...storedResponse, status: 'duplicated' });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('falls back to the stored duplicate when a concurrent request wins the unique-constraint race (P2002)', async () => {
    const storedResponse = {
      providerType: 'PSP',
      provider,
      brandId,
      idempotencyKey: `PSP:${provider}:${dto.webhookId}`,
      status: 'created',
      accepted: true,
    };

    prisma.idempotencyKey.findUnique
      .mockResolvedValueOnce(null) // no existing row at first check
      .mockResolvedValueOnce({ storedResponse }); // the winning concurrent request's row

    const p2002 = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed on the fields: (`brandId`,`key`)',
      { code: 'P2002', clientVersion: 'test' },
    );
    prisma.$transaction.mockRejectedValue(p2002);

    const result = await handler.handle(provider, brandId, dto);

    expect(result).toEqual({ ...storedResponse, status: 'duplicated' });
    expect(prisma.idempotencyKey.findUnique).toHaveBeenCalledTimes(2);
  });

  it('rethrows unexpected errors instead of swallowing them', async () => {
    prisma.idempotencyKey.findUnique.mockResolvedValueOnce(null);
    prisma.$transaction.mockRejectedValue(new Error('connection lost'));

    await expect(handler.handle(provider, brandId, dto)).rejects.toThrow(
      'connection lost',
    );
  });
});
