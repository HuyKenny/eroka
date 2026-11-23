// eroka-img after the Cloudflare Free-plan migration (23. 11. 2026). The site is frozen into static assets and its HTML links the
// thumbnails straight on img.eroka.cz = the R2 bucket eroka-thumbs on a custom domain (zone cache rule: 1 year), so no Worker runs
// for an image. This script only answers old /img/<w>/<sig>/<base64url>.webp URLs (pages cached before the switch, image search):
// one SHA-256 (WebCrypto, native) and a permanent redirect to the R2 object <w>/<sha256(base64url)>.webp — no WASM, no bindings.
// The previous resizing Worker is src/index.ts (rollback: "main": "./src/index.ts" + its bindings from git history).
const WIDTHS = new Set(['160', '320', '480', '640', '960']);
const enc = new TextEncoder();

export default {
  async fetch(request: Request): Promise<Response> {
    const m = /^\/img\/(\d+)\/[0-9a-f]{16}\/([A-Za-z0-9_-]{8,1400})\.webp$/.exec(new URL(request.url).pathname);
    if (!m || !WIDTHS.has(m[1]!)) return new Response('not found', { status: 404, headers: { 'content-type': 'text/plain', 'cache-control': 'public, max-age=86400' } });
    const d = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(m[2]!)));
    let h = '';
    for (const x of d) h += x.toString(16).padStart(2, '0');
    return new Response(null, { status: 301, headers: { location: `https://img.eroka.cz/${m[1]}/${h}.webp`, 'cache-control': 'public, max-age=31536000, immutable' } });
  },
};
