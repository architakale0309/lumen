import 'dotenv/config';
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { streamChat } from './chat.js';
import { SseWriter } from './sse.js';
import type { ChatRequest } from '@lumen/shared';

const app = new Hono();
const ACCESS_TOKEN = process.env.LUMEN_ACCESS_TOKEN;

app.get('/api/health', (c) => c.json({ ok: true }));

app.post('/api/chat', async (c) => {
  if (ACCESS_TOKEN) {
    const token = c.req.header('x-lumen-token');
    if (token !== ACCESS_TOKEN) {
      return c.json({ error: 'unauthorized' }, 401);
    }
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
