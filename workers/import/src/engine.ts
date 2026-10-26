// One feed per run: download → stream-parse → match to catalogue products → write only changes → recompute the
// product price summary. finalizeDay() once per night: stale feeds, price history, sitemaps, data_version.
// The catalogue itself is fixed (Kenny, 26. 10. 2026: catalogue 1:1) — feeds only add/refresh offers of existing products.
import { decodeXmlStream, parseXmlItems, XmlError } from './xml/stream';
import { FEEDS, feedKey, type FeedDef } from './feeds';
import { itemHash, parseItem, type Item } from './parse';
import { openFeed, FeedFetchError } from './http';
import { rebuildSitemaps } from '../../../src/lib/sitemap';

export interface Env {
  DB: D1Database;
  IMPORT_SHARED_SECRET?: string;
  ALLOWED_FEED_HOSTS?: string;
  MAX_DROP_PCT?: string;
  STALE_DAYS?: string;
  [k: string]: unknown;   // FEED_URL_<n>
}
export interface RunResult { feed: string; status: 'ok' | 'skipped' | 'error' | 'suspicious'; read: number; matched: number; created: number; rekeyed: number; changed: number; deactivated: number; message?: string; ms: number }

const now = () => new Date().toISOString().slice(0, 19).replace('T', ' ');
const today = () => new Date().toISOString().slice(0, 10);
const log = (event: string, data: Record<string, unknown>) => console.log(JSON.stringify({ event, ...data }));

async function chunks<T>(list: T[], size: number, fn: (part: T[]) => Promise<unknown>) {
  for (let i = 0; i < list.length; i += size) await fn(list.slice(i, i + size));
}

function slugify(t: string): string {
  return t.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '') || 'nabidka';
}
function shortHash(s: string): string {
  let h = 0x811c9dc5;
  for (let k = 0; k < s.length; k++) { h ^= s.charCodeAt(k); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, '0').slice(0, 6);
}

/** Recompute min/max/offer_count/shop_count/best offer (cheapest not-out-of-stock, else cheapest) for products. */
export async function recomputeProducts(db: D1Database, ids: number[]) {
  const uniq = [...new Set(ids)];
  await chunks(uniq, 90, async (part) => {
    const ph = part.map(() => '?').join(',');
    const best = `SELECT %c FROM offers o WHERE o.product_id = products.id AND o.active = 1 ORDER BY (o.stock = -1), o.price, o.id LIMIT 1`;
    await db.prepare(`UPDATE products SET
        offer_count = (SELECT COUNT(*) FROM offers o WHERE o.product_id = products.id AND o.active = 1),
        shop_count = (SELECT COUNT(DISTINCT o.domain) FROM offers o WHERE o.product_id = products.id AND o.active = 1),
        min_price = COALESCE((SELECT MIN(o.price) FROM offers o WHERE o.product_id = products.id AND o.active = 1), 0),
        max_price = COALESCE((SELECT MAX(o.price) FROM offers o WHERE o.product_id = products.id AND o.active = 1), 0),
        best_offer_id = COALESCE((${best.replace('%c', 'o.id')}), 0),
        best_domain = COALESCE((${best.replace('%c', 'o.domain')}), '')
      WHERE id IN (${ph})`).bind(...part).run();
  });
}

async function state(db: D1Database, key: string) {
  return db.prepare('SELECT * FROM feed_state WHERE feed = ?').bind(key).first<{ feed: string; last_attempt_at: string | null; last_success_at: string | null; last_count: number; created_at: string; etag: string | null; last_modified: string | null }>();
}

export async function runFeed(env: Env, f: FeedDef, opts: { force?: boolean } = {}): Promise<RunResult> {
  const t0 = Date.now();
  const key = feedKey(f);
  const db = env.DB;
  const res: RunResult = { feed: key, status: 'ok', read: 0, matched: 0, created: 0, rekeyed: 0, changed: 0, deactivated: 0, ms: 0 };
  const st = await state(db, key);
  await db.prepare(`INSERT INTO feed_state (feed, created_at, last_attempt_at) VALUES (?, ?, ?)
      ON CONFLICT(feed) DO UPDATE SET last_attempt_at = excluded.last_attempt_at`).bind(key, now(), now()).run();
  const url = String(env[`FEED_URL_${f.id}`] ?? '');
  const finish = async (status: RunResult['status'], message = '') => {
    res.status = status; res.ms = Date.now() - t0;
    if (message) res.message = message;
    await db.prepare(`INSERT INTO import_runs (feed, started_at, finished_at, status, items_read, items_matched, items_created, items_changed, items_deactivated, duration_ms, message)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(key, new Date(t0).toISOString(), new Date().toISOString(), status, res.read, res.matched, res.created, res.changed, res.deactivated, res.ms, message.slice(0, 300)).run();
    if (status === 'ok') await db.prepare('UPDATE feed_state SET last_success_at = ?, last_count = ?, last_message = NULL WHERE feed = ?').bind(now(), res.matched, key).run();
    else await db.prepare('UPDATE feed_state SET last_message = ? WHERE feed = ?').bind(`${status}: ${message}`.slice(0, 300), key).run();
    log('feed.done', { ...res });
    return res;
  };
  if (!url) return finish('skipped', 'no FEED_URL secret');

  // existing offers of this feed: uid → [{id, product_id, hash, active}], and by product (shops renumber item ids)
  type Row = { id: number; unique_id: string; product_id: number; content_hash: string; active: number };
  const existing = new Map<string, Row[]>();
  const byProduct = new Map<number, Row[]>();
  for (const r of (await db.prepare('SELECT id, unique_id, product_id, content_hash, active FROM offers WHERE feed = ?').bind(key).all<Row>()).results) {
    (existing.get(r.unique_id) ?? existing.set(r.unique_id, []).get(r.unique_id)!).push(r);
    (byProduct.get(r.product_id) ?? byProduct.set(r.product_id, []).get(r.product_id)!).push(r);
  }
  let eanMap: Map<string, number> | null = null;
  const loadEans = async () => {
    const m = new Map<string, number>();
    const dup = new Set<string>();
    const add = (e: string, pid: number) => { if (!e) return; const p = m.get(e); if (p !== undefined && p !== pid) dup.add(e); else m.set(e, pid); };
    for (const r of (await db.prepare("SELECT id, ean FROM products WHERE ean <> '' AND status = 'publish'").all<{ id: number; ean: string }>()).results) add(r.ean.replace(/^0+(?=\d{12,13}$)/, ''), r.id);
    for (const r of (await db.prepare("SELECT product_id, ean FROM offers WHERE ean <> '' AND feed = 'Feed__6'").all<{ product_id: number; ean: string }>()).results) add(r.ean.replace(/^0+(?=\d{12,13}$)/, ''), r.product_id);
    for (const e of dup) m.delete(e); // ambiguous EAN → never attach automatically
    return m;
  };

  let body;
  try {
    const o = await openFeed(url, env.ALLOWED_FEED_HOSTS, opts.force ? {} : { etag: st?.etag ?? null, lastModified: st?.last_modified ?? null });
    if (o.status === 'not_modified') { res.matched = st?.last_count ?? 0; return finish('ok', 'not modified'); }
    body = o.body;
    await db.prepare('UPDATE feed_state SET etag = ?, last_modified = ? WHERE feed = ?').bind(o.etag, o.lastModified, key).run();
  } catch (e) {
    return finish('error', e instanceof FeedFetchError ? e.message : 'download failed');
  }

  // pass 1: read the whole feed (12k small objects fit easily), so re-keying knows which old item ids still exist
  const items = new Map<string, Item>();
  try {
    for await (const node of parseXmlItems(decodeXmlStream(body, { maxBytes: 600_000_000 }), f.format === 'google' ? 'item' : 'SHOPITEM')) {
      res.read++;
      const it = parseItem(f, node);
      if (it && !items.has(it.uid)) items.set(it.uid, it);
    }
  } catch (e) {
    return finish('error', e instanceof XmlError ? `xml ${e.code}: ${e.message}` : `parse failed: ${String(e).slice(0, 120)}`);
  }

  // pass 2: match and write only changes
  const seen = new Set<number>();          // offer ids present in this run
  const affected: number[] = [];
  const writes: D1PreparedStatement[] = [];
  const stamp = new Date().toISOString().slice(0, 19) + 'Z';
  const flush = async () => { if (writes.length) { await db.batch(writes.splice(0, writes.length)); } };
  const rekeyed = new Set<number>();
  for (const it of items.values()) {
    const hash = itemHash(it);
    let rows = existing.get(it.uid);
    if (!rows && it.ean) {
      eanMap ??= await loadEans();
      const pid = eanMap.get(it.ean);
      // the product already has an offer from this shop under an item id the feed no longer has → re-key it (keeps /go/)
      const old = pid ? (byProduct.get(pid) ?? []).find((r) => !items.has(r.unique_id) && !rekeyed.has(r.id)) : undefined;
      if (pid && old) {
        rekeyed.add(old.id);
        writes.push(db.prepare('UPDATE offers SET unique_id = ? WHERE id = ?').bind(it.uid, old.id));
        rows = [{ ...old, unique_id: it.uid, content_hash: '' }];
        res.rekeyed++;
      } else if (pid) {
        const go = `${slugify(it.title)}-${shortHash(`${key}|${it.uid}|${pid}`)}`;
        writes.push(db.prepare(`INSERT INTO offers (product_id, feed, unique_id, title, domain, price, price_old, currency, target_url, orig_url, stock, ean, img, go_slug, updated_at, active, content_hash)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'CZK', ?, ?, ?, ?, ?, ?, ?, 1, ?) ON CONFLICT DO NOTHING`)
          .bind(pid, key, it.uid, it.title, f.domain, it.price, it.priceOld, it.url, it.orig, it.stock, it.ean, it.img, go, stamp, hash));
        res.created++; res.matched++; affected.push(pid);
      }
    }
    for (const r of rows ?? []) {
      seen.add(r.id); res.matched++;
      if (r.content_hash === hash && r.active === 1) continue;
      writes.push(db.prepare('UPDATE offers SET title = ?, price = ?, price_old = ?, target_url = ?, orig_url = ?, stock = ?, ean = CASE WHEN ? <> \'\' THEN ? ELSE ean END, img = ?, updated_at = ?, active = 1, content_hash = ? WHERE id = ?')
        .bind(it.title, it.price, it.priceOld, it.url, it.orig, it.stock, it.ean, it.ean, it.img, stamp, hash, r.id));
      res.changed++; affected.push(r.product_id);
    }
    if (writes.length >= 50) await flush();
  }
  await flush();

  // offers that disappeared from the feed → inactive, unless the feed shrank suspiciously (broken export)
  const activeBefore = [...existing.values()].flat().filter((r) => r.active === 1);
  const missing = activeBefore.filter((r) => !seen.has(r.id));
  const maxDrop = Number(env.MAX_DROP_PCT ?? 40) / 100;
  if (activeBefore.length > 20 && missing.length > activeBefore.length * maxDrop) {
    if (affected.length) await recomputeProducts(db, affected);
    return finish('suspicious', `${missing.length} of ${activeBefore.length} active offers missing — not deactivated (MAX_DROP_PCT)`);
  }
  await chunks(missing, 90, async (part) => {
    await db.prepare(`UPDATE offers SET active = 0, updated_at = ? WHERE id IN (${part.map(() => '?').join(',')})`).bind(stamp, ...part.map((r) => r.id)).run();
  });
  res.deactivated = missing.length;
  affected.push(...missing.map((r) => r.product_id));
  await recomputeProducts(db, affected);
  return finish('ok');
}

/** Next feed due (not attempted in the last 20 h), oldest attempt first. */
export async function nextDueFeed(db: D1Database): Promise<FeedDef | null> {
  const rows = (await db.prepare('SELECT feed, last_attempt_at FROM feed_state').all<{ feed: string; last_attempt_at: string | null }>()).results;
  const by = new Map(rows.map((r) => [r.feed, r.last_attempt_at]));
  const cutoff = new Date(Date.now() - 20 * 3600_000).toISOString().slice(0, 19).replace('T', ' ');
  const due = FEEDS.filter((f) => { const a = by.get(feedKey(f)); return f.enabled !== false && (!a || a < cutoff); });
  due.sort((a, b) => (by.get(feedKey(a)) ?? '').localeCompare(by.get(feedKey(b)) ?? ''));
  return due[0] ?? null;
}

/** Once per day after the feeds: deactivate offers of switched-off feeds and of feeds that have not succeeded for
 *  STALE_DAYS (expired token, dead feed; CJ offers have no feed_state row and stay — Kenny 26. 10.), record the day's minimum price per product, rebuild sitemaps and bump data_version (page cache). */
export async function finalizeDay(env: Env): Promise<Record<string, unknown>> {
  const db = env.DB;
  const day = today();
  const done = await db.prepare("SELECT value FROM site_cache WHERE key = 'import:finalized'").first<{ value: string }>();
  if (done?.value === day) return { skipped: 'already finalized today' };
  const staleDays = Number(env.STALE_DAYS ?? 7);
  const cutoff = new Date(Date.now() - staleDays * 86400_000).toISOString().slice(0, 19).replace('T', ' ');
  const stale = (await db.prepare('SELECT feed FROM feed_state WHERE COALESCE(last_success_at, created_at) < ?').bind(cutoff).all<{ feed: string }>()).results.map((r) => r.feed);
  // switched-off feeds (feeds.ts enabled: false) are hidden right away
  for (const f of FEEDS) if (f.enabled === false && !stale.includes(feedKey(f))) stale.push(feedKey(f));
  let staleOffers = 0;
  for (const feed of stale) {
    const ids = (await db.prepare('SELECT id, product_id FROM offers WHERE feed = ? AND active = 1').bind(feed).all<{ id: number; product_id: number }>()).results;
    if (!ids.length) continue;
    await chunks(ids, 90, async (part) => { await db.prepare(`UPDATE offers SET active = 0 WHERE id IN (${part.map(() => '?').join(',')})`).bind(...part.map((r) => r.id)).run(); });
    await recomputeProducts(db, ids.map((r) => r.product_id));
    staleOffers += ids.length;
    log('feed.stale', { feed, offers: ids.length });
  }
  // price history only when the minimum changed (the chart draws steps)
  const hist = await db.prepare(`INSERT INTO price_history (product_id, day, min_price)
      SELECT p.id, ?, p.min_price FROM products p
      WHERE p.min_price > 0 AND p.min_price <> COALESCE((SELECT h.min_price FROM price_history h WHERE h.product_id = p.id ORDER BY h.day DESC LIMIT 1), -1)
      ON CONFLICT(product_id, day) DO UPDATE SET min_price = excluded.min_price`).bind(day).run();
  const sm = await rebuildSitemaps(db);
  const stamp = new Date().toISOString();
  await db.batch([
    db.prepare("INSERT INTO site_cache (key, value, updated_at) VALUES ('data_version', ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at").bind(stamp, stamp),
    db.prepare("INSERT INTO site_cache (key, value, updated_at) VALUES ('import:finalized', ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at").bind(day, stamp),
  ]);
  const out = { day, stale_feeds: stale, stale_offers: staleOffers, price_history_rows: hist.meta.changes ?? 0, sitemaps: sm };
  log('day.finalized', out);
  return out;
}
