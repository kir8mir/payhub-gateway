import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, randomBrandId } from './utils/create-test-app';

describe('Auth guard behavior (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    ({ app } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  it('allows register and login without any Authorization header (public endpoints)', async () => {
    const brandId = randomBrandId();
    const email = `guard-${randomBrandId()}@example.com`;
    const password = 'password123';

    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password, brandId })
      .expect(201);

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password, brandId })
      .expect(201);
  });

  it('rejects /profile/me with no token', async () => {
    await request(app.getHttpServer()).get('/profile/me').expect(401);
  });

  it('rejects /profile/me with a malformed token', async () => {
    await request(app.getHttpServer())
      .get('/profile/me')
      .set('Authorization', 'Bearer not-a-real-token')
      .expect(401);
  });

  it('allows /profile/me with a valid token and returns the matching user', async () => {
    const brandId = randomBrandId();
    const email = `guard-${randomBrandId()}@example.com`;
    const password = 'password123';

    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password, brandId })
      .expect(201);

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password, brandId })
      .expect(201);

    const me = await request(app.getHttpServer())
      .get('/profile/me')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .expect(200);

    expect(me.body.email).toBe(email);
    expect(me.body.brandId).toBe(brandId);
  });
});
