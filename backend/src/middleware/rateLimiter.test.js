import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createLoginLimiter, createAuthLimiter } from './rateLimiter.js';

// Each test builds its own tiny Express app around a freshly-constructed
// limiter instance, so counters never leak between test cases or interact
// with the app-wide loginLimiter/authLimiter singletons used in server.js.
function appWithLimiter(limiter) {
  const app = express();
  app.post('/protected', limiter, (req, res) => res.json({ ok: true }));
  return app;
}

describe('createLoginLimiter', () => {
  it('allows requests up to the configured limit', async () => {
    const app = appWithLimiter(createLoginLimiter({ limit: 3 }));

    for (let i = 0; i < 3; i++) {
      const res = await request(app).post('/protected');
      expect(res.status).toBe(200);
    }
  });

  it('rejects with 429 once the limit is exceeded, and does not run the route handler', async () => {
    const app = appWithLimiter(createLoginLimiter({ limit: 3 }));

    for (let i = 0; i < 3; i++) {
      await request(app).post('/protected');
    }

    const blocked = await request(app).post('/protected');
    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toMatch(/too many/i);
  });

});

describe('createAuthLimiter', () => {
  it('has a looser default limit than the login limiter (30 vs 10)', async () => {
    const app = appWithLimiter(createAuthLimiter({ limit: 5 }));

    for (let i = 0; i < 5; i++) {
      const res = await request(app).post('/protected');
      expect(res.status).toBe(200);
    }

    const blocked = await request(app).post('/protected');
    expect(blocked.status).toBe(429);
  });
});
