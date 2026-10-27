import { env as cfEnv } from 'cloudflare:workers';

export interface AppEnv {
  DB: D1Database;
  MEDIA?: R2Bucket;
  ASSETS?: Fetcher;
  /** eroka-img thumbnail Worker (service binding), see workers/img */
  IMG?: Fetcher;
  RL_GO?: RateLimit;
  RL_SEARCH?: RateLimit;
  ENVIRONMENT?: string;
  SITE_URL?: string;
  ALLOWED_HOSTS?: string;
  REQUIRE_ACCESS_EVERYWHERE?: string;
  ANALYTICS_ENABLED?: string;
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  ADMIN_DEV_BYPASS?: string;
  IP_HASH_SALT?: string;
  GO_ALLOWED_HOSTS?: string;
}

export function getEnv(): AppEnv {
  return cfEnv as unknown as AppEnv;
}

/** local/test only — never true in staging/production. */
export function isLocal(e: AppEnv = getEnv()): boolean {
  return e.ENVIRONMENT === 'local' || e.ENVIRONMENT === 'test';
}

export function siteUrl(e: AppEnv = getEnv()): string {
  return (e.SITE_URL || 'https://eroka.cz').replace(/\/$/, '');
}

/** Canonical base is always the production domain (staging pages are noindex anyway; parity checks compare 1:1). */
export const CANONICAL_BASE = 'https://eroka.cz';

export function isProduction(e: AppEnv = getEnv()): boolean {
  return e.ENVIRONMENT === 'production';
}

export function allowedHosts(e: AppEnv = getEnv()): string[] {
  return (e.ALLOWED_HOSTS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
}
