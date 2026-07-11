import { createHmac } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/persistence/prisma/prisma.service';
import { createTestApp, randomBrandId } from './utils/create-test-app';

function sign(payload: unknown): string {
  const secret = process.env.WEBHOOK_SECRET;
  if (!secret) {
    throw new Error('WEBHOOK_SECRET is not set for the test run');
  }
  return createHmac('sha256', secret)
    .update(JSON.stringify(payload))
    .digest('hex');
}

describe('Callback idempotency (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  it('deduplicates a repeated PSP callback and persists exactly one raw event', async () => {
    const brandId = randomBrandId();
    const body = { webhookId: `evt-${randomBrandId()}`, payload: { amount: 100 } };
    const signature = sign(body);

    const first = await request(app.getHttpServer())
      .post('/webhooks/psp/stripe')
      .set('x-brand-id', String(brandId))
      .set('x-webhook-signature', signature)
      .send(body)
      .expect(201);

    expect(first.body.status).toBe('created');

    const second = await request(app.getHttpServer())
      .post('/webhooks/psp/stripe')
      .set('x-brand-id', String(brandId))
      .set('x-webhook-signature', signature)
      .send(body)
      .expect(201);

    expect(second.body.status).toBe('duplicated');
    expect(second.body.idempotencyKey).toBe(first.body.idempotencyKey);

    const storedKey = `PSP:stripe:${body.webhookId}`;
    const rows = await prisma.rawWebhook.findMany({
      where: { brandId, idempotencyKey: storedKey },
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].payload).toEqual(body.payload);
  });

  it('rejects a callback with a missing or invalid signature', async () => {
    const brandId = randomBrandId();
    const body = { webhookId: `evt-${randomBrandId()}`, payload: { amount: 1 } };

    await request(app.getHttpServer())
      .post('/webhooks/psp/stripe')
      .set('x-brand-id', String(brandId))
      .send(body)
      .expect(401);

    await request(app.getHttpServer())
      .post('/webhooks/psp/stripe')
      .set('x-brand-id', String(brandId))
      .set('x-webhook-signature', 'deadbeef')
      .send(body)
      .expect(401);
  });
});
