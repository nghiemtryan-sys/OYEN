import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

const MAX_BYTES = 1024 * 1024;
const reply = (text, status = 200, extra = {}) => {
  // Static failure reasons only: never log tokens, signatures or message bodies.
  if (status >= 400) console.warn('[OYEN webhook] ' + status + ' ' + text);
  return new Response(text, {
    status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', ...extra }
  });
};
function same(a, b) {
  const left = Buffer.from(a), right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
async function readBody(request) {
  if (Number(request.headers.get('content-length')) > MAX_BYTES) throw new Error('too_large');
  const reader = request.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const chunks = []; let total = 0;
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) { await reader.cancel(); throw new Error('too_large'); }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

// Dependency injection permits testing without contacting Meta or the real database.
export function createHandler({ env = process.env, fetchImpl = globalThis.fetch } = {}) {
  return async function handle(request) {
    if (request.method === 'GET') {
      const params = new URL(request.url).searchParams;
      if (!env.META_VERIFY_TOKEN) return reply('Webhook verification is not configured', 503);
      const token = params.get('hub.verify_token') || '';
      const challenge = params.get('hub.challenge');
      if (params.get('hub.mode') !== 'subscribe' || !same(token, env.META_VERIFY_TOKEN)) return reply('Forbidden', 403);
      if (!challenge || challenge.length > 2048) return reply('Missing or invalid challenge', 400);
      return reply(challenge);
    }
    if (request.method !== 'POST') return reply('Method not allowed', 405, { Allow: 'GET, POST' });
    if (!env.META_APP_SECRET) return reply('Webhook signature validation is not configured', 503);
    let raw;
    try { raw = await readBody(request); }
    catch (error) { return reply(error.message === 'too_large' ? 'Payload too large' : 'Unable to read request', error.message === 'too_large' ? 413 : 400); }
    const signature = request.headers.get('x-hub-signature-256') || '';
    if (!/^sha256=[a-f0-9]{64}$/i.test(signature)) return reply('Invalid signature', 403);
    const expected = 'sha256=' + createHmac('sha256', env.META_APP_SECRET).update(raw).digest('hex');
    if (!same(signature.toLowerCase(), expected)) return reply('Invalid signature', 403);
    let payload;
    try { payload = JSON.parse(raw.toString('utf8')); } catch { return reply('Invalid JSON', 400); }
    if (payload?.object !== 'page' || !Array.isArray(payload.entry) || !payload.entry.length) return reply('Unsupported event', 400);
    const allowed = new Set((env.META_PAGE_IDS || '').split(',').map(s => s.trim()).filter(Boolean));
    if (!allowed.size || !env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return reply('Webhook storage is not configured', 503);
    if (payload.entry.some(entry => !entry || typeof entry.id !== 'string' || !allowed.has(entry.id))) return reply('Page is not configured for this app', 403);
    let base;
    try {
      base = new URL(env.SUPABASE_URL);
      if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash || base.pathname !== '/') throw new Error();
    } catch { return reply('Invalid database configuration', 503); }
    // Acknowledge only after durable storage; failures must stay visible to Meta retries.
    try {
      const result = await fetchImpl(new URL('/rest/v1/oyen_meta_webhook_events?on_conflict=payload_hash', base), {
        method: 'POST', signal: AbortSignal.timeout(8000),
        headers: {
          apikey: env.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY,
          'Content-Type': 'application/json',
          Prefer: 'resolution=ignore-duplicates,return=minimal'
        },
        body: JSON.stringify({ payload_hash: createHash('sha256').update(raw).digest('hex'), payload })
      });
      if (!result.ok) return reply('Unable to persist event; retry required', 503);
      return reply('EVENT_RECEIVED');
    } catch { return reply('Unable to persist event; retry required', 503); }
  };
}

export default { fetch: createHandler() };
