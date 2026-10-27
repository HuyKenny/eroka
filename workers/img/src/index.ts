// eroka-img: product photo thumbnails for the shops whose images wsrv.nl refuses ("Domain or TLD blocked by policy":
// Růžový slon, ErosStar, Vibratory.net, Sexshop.cz). The photo is fetched from the partner's feed URL, resized in
// WASM and returned as WebP. Nothing is stored (Kenny, 27. 10. 2026: save space) — only the edge cache and the
// browser keep the result (immutable, 1 year; the source URL is part of the path, so a new photo = a new URL).
//   GET /img/<width>/<base64url(source URL)>.webp     width ∈ WIDTHS, source host ∈ HOSTS
// Anything that cannot be decoded (GIF, AVIF, broken file) is answered with a redirect to the original.
import decodeJpeg, { init as initJpeg } from '@jsquash/jpeg/decode';
import decodePng, { init as initPng } from '@jsquash/png/decode';
import decodeWebp, { init as initWebpDec } from '@jsquash/webp/decode';
import encodeWebp, { init as initWebpEnc } from '@jsquash/webp/encode';
import resize, { initResize } from '@jsquash/resize';
import JPEG_DEC from '../../../node_modules/@jsquash/jpeg/codec/dec/mozjpeg_dec.wasm';
import PNG_DEC from '../../../node_modules/@jsquash/png/codec/pkg/squoosh_png_bg.wasm';
import WEBP_DEC from '../../../node_modules/@jsquash/webp/codec/dec/webp_dec.wasm';
import WEBP_ENC from '../../../node_modules/@jsquash/webp/codec/enc/webp_enc_simd.wasm';
import RESIZE from '../../../node_modules/@jsquash/resize/lib/resize/pkg/squoosh_resize_bg.wasm';

// the codecs construct ImageData, which the Workers runtime does not have
class ImageDataShim {
  constructor(public data: Uint8ClampedArray, public width: number, public height: number) {}
}
(globalThis as unknown as { ImageData: unknown }).ImageData ??= ImageDataShim;

export const WIDTHS = [160, 320, 480, 640, 960];
export const HOSTS = ['cdn.ruzovyslon.cz', 'www.erosstar.cz', 'erosstar.cz', 'vibratory.net', 'www.vibratory.net', 'www.sexshop.cz', 'pictures.sexshop.cz'];
const MAX_BYTES = 8_000_000;

let ready: Promise<unknown> | null = null;
const init = () => (ready ??= Promise.all([initJpeg(JPEG_DEC), initPng(PNG_DEC), initWebpDec(WEBP_DEC), initWebpEnc(WEBP_ENC), initResize(RESIZE)]));

function b64urlDecode(s: string): string {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4));
  return new TextDecoder().decode(Uint8Array.from(b, (c) => c.charCodeAt(0)));
}
const redirect = (to: string) => new Response(null, { status: 302, headers: { location: to, 'cache-control': 'public, max-age=3600' } });
const bad = (msg: string, status = 400) => new Response(msg, { status, headers: { 'content-type': 'text/plain', 'cache-control': 'public, max-age=300' } });

async function decode(buf: ArrayBuffer): Promise<{ data: Uint8ClampedArray; width: number; height: number } | null> {
  const b = new Uint8Array(buf, 0, 12);
  if (b[0] === 0xff && b[1] === 0xd8) return decodeJpeg(buf);
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return decodePng(buf);
  if (b[0] === 0x52 && b[1] === 0x49 && b[8] === 0x57 && b[9] === 0x45) return decodeWebp(buf);
  return null;
}

export default {
  async fetch(request: Request, _env: unknown, ctx: { waitUntil(p: Promise<unknown>): void }): Promise<Response> {
    if (request.method !== 'GET' && request.method !== 'HEAD') return bad('method', 405);
    const url = new URL(request.url);
    const m = /^\/img\/(\d+)\/([A-Za-z0-9_-]+)\.webp$/.exec(url.pathname);
    if (!m) return bad('not found', 404);
    const width = Number(m[1]);
    if (!WIDTHS.includes(width)) return bad('width');
    let src: URL;
    try { src = new URL(b64urlDecode(m[2]!)); } catch { return bad('source'); }
    if (src.protocol !== 'https:' || !HOSTS.includes(src.hostname)) return bad('host', 403);

    const cache = (caches as unknown as { default: Cache }).default;
    const key = new Request(`https://eroka-img.cache/${width}/${m[2]}.webp`);
    const hit = await cache.match(key);
    if (hit) return hit;

    try {
      const r = await fetch(src.toString(), { headers: { 'user-agent': 'Mozilla/5.0 (compatible; eroka.cz thumbnails)', accept: 'image/webp,image/jpeg,image/png,*/*' }, cf: { cacheTtl: 86400, cacheEverything: true } } as RequestInit);
      if (!r.ok) return r.status === 404 ? bad('source 404', 404) : redirect(src.toString());
      const len = Number(r.headers.get('content-length') ?? 0);
      if (len > MAX_BYTES) return redirect(src.toString());
      const buf = await r.arrayBuffer();
      if (buf.byteLength > MAX_BYTES || buf.byteLength < 12) return redirect(src.toString());
      await init();
      const img = await decode(buf);
      if (!img) return redirect(src.toString());
      // fit inside width × width, never enlarge
      const scale = Math.min(1, width / img.width, width / img.height);
      const w = Math.max(1, Math.round(img.width * scale)), h = Math.max(1, Math.round(img.height * scale));
      const out = scale < 1 ? await resize(img as ImageData, { width: w, height: h, method: 'lanczos3', fitMethod: 'stretch' }) : img;
      const webp = await encodeWebp(out as ImageData, { quality: 76 });
      const res = new Response(webp, {
        headers: {
          'content-type': 'image/webp', 'cache-control': 'public, max-age=31536000, immutable', 'access-control-allow-origin': '*',
          'x-content-type-options': 'nosniff', 'x-eroka-img': `${img.width}x${img.height}>${w}x${h}`,
        },
      });
      ctx.waitUntil(cache.put(key, res.clone()));
      return res;
    } catch (e) {
      console.log(JSON.stringify({ event: 'img.error', src: src.toString(), error: String(e).slice(0, 200) }));
      return redirect(src.toString());
    }
  },
};
