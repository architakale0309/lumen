import 'dotenv/config';
import { Hono } from 'hono';
import type { Context } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { streamChat } from './chat.js';
import { SseWriter } from './sse.js';
import type { ChatRequest } from '@lumen/shared';

const app = new Hono();
const ACCESS_TOKEN = process.env.LUMEN_ACCESS_TOKEN;

const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX ?? 7);
const RATE_LIMIT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60 * 60 * 1000);
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function getClientIp(c: Context): string {
  const xff = c.req.header('x-forwarded-for');
  if (xff) return xff.split(',')[0]!.trim();
  return c.req.header('x-real-ip') ?? 'unknown';
}

function checkRateLimit(ip: string): { allowed: boolean; retryAfterSec: number } {
  const now = Date.now();
  const bucket = rateBuckets.get(ip);
  if (!bucket || bucket.resetAt <= now) {
    rateBuckets.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true, retryAfterSec: 0 };
  }
  if (bucket.count >= RATE_LIMIT_MAX) {
    return { allowed: false, retryAfterSec: Math.ceil((bucket.resetAt - now) / 1000) };
  }
  bucket.count += 1;
  return { allowed: true, retryAfterSec: 0 };
}

setInterval(() => {
  const now = Date.now();
  for (const [ip, bucket] of rateBuckets) {
    if (bucket.resetAt <= now) rateBuckets.delete(ip);
  }
}, RATE_LIMIT_WINDOW_MS).unref();

app.get('/api/health', (c) => c.json({ ok: true }));

app.post('/api/chat', async (c) => {
  if (ACCESS_TOKEN) {
    const token = c.req.header('x-lumen-token');
    if (token !== ACCESS_TOKEN) {
      return c.json({ error: 'unauthorized' }, 401);
    }
  }

  const ip = getClientIp(c);
  const rate = checkRateLimit(ip);
  if (!rate.allowed) {
    c.header('Retry-After', String(rate.retryAfterSec));
    return c.json(
      { error: 'rate_limited', retryAfterSec: rate.retryAfterSec, limit: RATE_LIMIT_MAX, windowMs: RATE_LIMIT_WINDOW_MS },
      429,
    );
  }

  let body: ChatRequest;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid JSON' }, 400);
  }
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return c.json({ error: 'messages must be a non-empty array' }, 400);
  }

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const writer = new SseWriter(controller);
      streamChat(body.messages, writer).catch((err) => {
        writer.send({ type: 'error', message: (err as Error).message });
        writer.send({ type: 'done' });
        writer.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
});

app.use('/*', serveStatic({ root: './client/dist' }));

const port = Number(process.env.PORT ?? 8787);
if (!process.env.ANTHROPIC_API_KEY) {
  console.warn('[warn] ANTHROPIC_API_KEY is not set — /api/chat will fail.');
}
if (!ACCESS_TOKEN) {
  console.warn('[warn] LUMEN_ACCESS_TOKEN is not set — /api/chat is publicly accessible.');
}
serve({ fetch: app.fetch, port, hostname: '0.0.0.0' }, (info) => {
  console.log(`[server] listening on http://${info.address}:${info.port}`);
});
