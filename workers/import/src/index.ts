// eroka-import: cron every 10 min in the night window imports the next due feed; after all feeds the day is
// finalised (stale feeds, price history, sitemaps, data_version). HTTP API behind IMPORT_SHARED_SECRET for ops.
import { FEEDS, feedKey } from './feeds';
import { finalizeDay, nextDueFeed, runFeed, type Env } from './engine';

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data, null, 1), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

export async function tick(env: Env) {
  const f = await nextDueFeed(env.DB);
  if (f) return { feed: await runFeed(env, f) };
  return { finalize: await finalizeDay(env) };
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const secret = env.IMPORT_SHARED_SECRET ?? '';
    if (secret.length < 24 || !safeEqual(request.headers.get('authorization') ?? '', `Bearer ${secret}`)) return json({ error: 'unauthorized' }, 401);
    const url = new URL(request.url);
    const parts = url.pathname.replace(/^\/+|\/+$/g, '').split('/');
    if (request.method === 'GET' && parts[0] === 'status') {
      const feeds = (await env.DB.prepare('SELECT * FROM feed_state ORDER BY feed').all()).results;
      const runs = (await env.DB.prepare('SELECT * FROM import_runs ORDER BY id DESC LIMIT 40').all()).results;
      return json({ feeds, runs });
    }
    if (request.method === 'POST' && parts[0] === 'run' && parts[1]) {
      const f = FEEDS.find((x) => feedKey(x) === parts[1] || String(x.id) === parts[1]);
      if (!f) return json({ error: 'unknown feed' }, 404);
      // awaited: an HTTP invocation keeps running while the client waits (waitUntil work is cut after ~30 s)
      return json(await runFeed(env, f, { force: url.searchParams.get('force') === '1' }));
    }
    if (request.method === 'POST' && parts[0] === 'tick') return json(await tick(env));
    if (request.method === 'POST' && parts[0] === 'finalize') {
      if (url.searchParams.get('force') === '1') await env.DB.prepare("DELETE FROM site_cache WHERE key = 'import:finalized'").run();
      return json(await finalizeDay(env));
    }
    void ctx;
    return json({ error: 'not found' }, 404);
  },
  async scheduled(_event: ScheduledController, env: Env, _ctx: ExecutionContext): Promise<void> {
    const r = await tick(env);
    console.log(JSON.stringify({ event: 'cron.done', ...r }));
  },
};

declare interface ScheduledController { cron: string }
declare interface ExecutionContext { waitUntil(p: Promise<unknown>): void }
