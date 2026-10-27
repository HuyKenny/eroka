// Security headers. HTML responses get a strict CSP: scripts only with the per-response nonce ('strict-dynamic' lets
// the nonce'd GA4 loader add gtag.js; Cloudflare's injected challenge script picks the nonce from this header). The
// https:/'unsafe-inline' entries are ignored by browsers that support strict-dynamic and keep very old ones working.
const BASE_CSP = "object-src 'none'; base-uri 'self'; frame-ancestors 'self'; form-action 'self' https://*.cloudflareaccess.com; upgrade-insecure-requests";

export function htmlCsp(nonce: string): string {
  return `script-src 'nonce-${nonce}' 'strict-dynamic' https: 'unsafe-inline'; ${BASE_CSP}`;
}

export function securityHeaders(): Record<string, string> {
  return {
    'Content-Security-Policy': BASE_CSP,
    'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Frame-Options': 'SAMEORIGIN',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'X-Permitted-Cross-Domain-Policies': 'none',
  };
}
