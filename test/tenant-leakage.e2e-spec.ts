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

describe('Tenant leakage (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  it('lets brandA and brandB register the same email, and brandA cannot see brandB data via /profile/me', async () => {
    const brandA = randomBrandId();
    const brandB = randomBrandId();
    const email = `shared-${randomBrandId()}@example.com`;
    const password = 'password123';

    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password, brandId: brandA })
      .expect(201);

    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password, brandId: brandB })
      .expect(201);

    const loginA = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password, brandId: brandA })
      .expect(201);

    const loginB = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password, brandId: brandB })
      .expect(201);

    const meA = await request(app.getHttpServer())
      .get('/profile/me')
      .set('Authorization', `Bearer ${loginA.body.accessToken}`)
      .expect(200);

    const meB = await request(app.getHttpServer())
      .get('/profile/me')
      .set('Authorization', `Bearer ${loginB.body.accessToken}`)
      .expect(200);

    expect(meA.body.brandId).toBe(brandA);
    expect(meA.body.brandId).not.toBe(brandB);
    expect(meB.body.brandId).toBe(brandB);
    expect(meA.body.id).not.toBe(meB.body.id);
  });

  it('does not deduplicate the same webhookId across different brands', async () => {
    const brandA = randomBrandId();
    const brandB = randomBrandId();
    const webhookId = `evt-${randomBrandId()}`;
    const body = { webhookId, payload: { amount: 50 } };
    const signature = sign(body);

    const resA = await request(app.getHttpServer())
      .post('/webhooks/gsp/betsoft')
      .set('x-brand-id', String(brandA))
      .set('x-webhook-signature', signature)
      .send(body)
      .expect(201);

    const resB = await request(app.getHttpServer())
      .post('/webhooks/gsp/betsoft')
      .set('x-brand-id', String(brandB))
      .set('x-webhook-signature', signature)
      .send(body)
      .expect(201);

    expect(resA.body.status).toBe('created');
    expect(resB.body.status).toBe('created');

    const storedKey = `GSP:betsoft:${webhookId}`;

    const rowsA = await prisma.rawWebhook.findMany({
      where: { brandId: brandA, idempotencyKey: storedKey },
    });
    const rowsB = await prisma.rawWebhook.findMany({
      where: { brandId: brandB, idempotencyKey: storedKey },
    });

    expect(rowsA).toHaveLength(1);
    expect(rowsB).toHaveLength(1);
    expect(rowsA[0].id).not.toBe(rowsB[0].id);
  });
});
