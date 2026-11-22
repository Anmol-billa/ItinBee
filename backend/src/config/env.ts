import crypto from 'node:crypto';
import { z } from 'zod';

export const DEV_DEFAULT_JWT_SECRET =
  'dev-itinbee-hmac-secret-change-in-production-32chars';
export const DEV_DEFAULT_MASTER_KEY_HEX =
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

const BooleanFromEnv = z
  .union([z.boolean(), z.string()])
  .optional()
  .transform((v) => {
    if (typeof v === 'boolean') return v;
    if (v === undefined) return false;
    const norm = v.trim().toLowerCase();
    return norm === 'true' || norm === '1' || norm === 'yes';
  });

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().optional(),
  CORS_ORIGINS: z.string().default('http://localhost:3000,https://itinbee.com'),
  JWT_SECRET: z.string().min(16).default(DEV_DEFAULT_JWT_SECRET),
  DATABASE_URL: z.string().optional(),
  REDIS_URL: z.string().optional(),
  RUN_INLINE_WORKER: z
    .string()
    .optional()
    .transform((v) => (v === undefined ? true : v === 'true' || v === '1')),
  LOCAL_DEV_STORE_FILE: z.string().optional(),
  // Vault & Object Storage (Cloudflare R2 / AWS S3 + PostgreSQL encrypted fallback)
  S3_ENDPOINT: z.string().optional(),
  AWS_REGION: z.string().optional(),
  AWS_S3_VAULT_REGION: z.string().default('ap-south-1'),
  AWS_S3_VAULT_BUCKET: z.string().optional(),
  KMS_KEY_ID: z.string().optional(),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  DEV_MASTER_KEY_HEX: z.string().optional(),
  // Stage 3 Structured LLM Fallback
  GCP_VERTEX_LOCATION: z.string().default('asia-south1'),
  GCP_VERTEX_PROJECT_ID: z.string().optional(),
  GOOGLE_VERTEX_API_KEY: z.string().optional(),
  // Bot protection, Webhooks & Telemetry
  TURNSTILE_SECRET_KEY: z.string().optional(),
  WEBHOOK_HMAC_SECRET: z.string().optional(),
  SENTRY_DSN: z.string().optional(),
  // Open-data geospatial & places engine
  PHOTON_BASE_URL: z.string().optional(),
  ORS_API_KEY: z.string().optional(),
  WIKIMEDIA_USER_AGENT: z.string().default('Itinbee/1.0 (contact via itinbee.com)'),
  OVERPASS_ENDPOINTS: z
    .string()
    .default(
      'https://overpass-api.de/api/interpreter,https://overpass.private.coffee/api/interpreter,https://overpass.kumi.systems/api/interpreter'
    ),
  ADMIN_TOKEN: z.string().optional(),
  PLACES_STORE_FILE: z.string().optional(),
  PACK_TTL_DAYS: z.coerce.number().int().positive().default(45),
  // Public URLs & Render Host Discovery
  APP_PUBLIC_URL: z.string().default('http://localhost:3000'),
  FRONTEND_HOST: z.string().optional(),
  PUBLIC_BACKEND_URL: z.string().optional(),
  PUBLIC_BACKEND_HOST: z.string().optional(),
  // Auth & Email Delivery (Google Sign-In, Resend API, or Nodemailer SMTP)
  GOOGLE_CLIENT_ID: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM_EMAIL: z.string().default('Itinbee <onboarding@resend.dev>'),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: BooleanFromEnv,
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),
  // Phase 3 Smart Import & Gemini
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default('gemini-2.5-flash'),
  GEMINI_TIMEOUT_MS: z.coerce.number().int().positive().default(45000),
  IMPORT_DAILY_LIMIT_GUEST: z.coerce.number().int().nonnegative().default(15),
  IMPORT_DAILY_LIMIT_USER: z.coerce.number().int().nonnegative().default(50),
  IMPORT_DAILY_LIMIT_IP: z.coerce.number().int().nonnegative().default(60),
  IMPORT_DAILY_GLOBAL_CAP: z.coerce.number().int().nonnegative().default(500),
  IMPORT_DAILY_LIMIT_ASSIST: z.coerce.number().int().nonnegative().default(60),
  IMPORT_PACK_WAIT_MS: z.coerce.number().int().nonnegative().default(15000),
});

export type AppEnv = z.infer<typeof EnvSchema> & {
  resolvedPort: number;
  corsOriginList: string[];
  overpassEndpointList: string[];
};

export function expandHostToOrigins(rawHost?: string): string[] {
  const cleaned = rawHost
    ?.trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/+$/, '');
  if (!cleaned) return [];
  if (cleaned.startsWith('localhost') || cleaned.startsWith('127.0.0.1')) {
    return [`http://${cleaned}`];
  }
  if (cleaned.includes('.')) {
    return [`https://${cleaned}`];
  }
  return [`https://${cleaned}`, `https://${cleaned}.onrender.com`];
}

export function loadEnv(overrides: Record<string, string | undefined> = {}): AppEnv {
  const merged = { ...process.env, ...overrides };
  const parsed = EnvSchema.parse(merged);

  if (parsed.NODE_ENV === 'production') {
    const jwtSecret = parsed.JWT_SECRET?.trim() ?? '';
    if (
      jwtSecret.length < 32 ||
      jwtSecret.toLowerCase().includes('dev-only') ||
      jwtSecret === DEV_DEFAULT_JWT_SECRET
    ) {
      throw new Error(
        'FATAL [config]: NODE_ENV=production requires a strong non-default JWT_SECRET (>= 32 chars, must not contain "dev-only").'
      );
    }

    const hasKmsKey = Boolean(parsed.KMS_KEY_ID?.trim());
    const rawMasterKey = parsed.DEV_MASTER_KEY_HEX?.trim() ?? '';
    if (
      !hasKmsKey &&
      rawMasterKey.length > 0 &&
      (rawMasterKey.length < 32 ||
        rawMasterKey.toLowerCase() === DEV_DEFAULT_MASTER_KEY_HEX)
    ) {
      throw new Error(
        'FATAL [config]: NODE_ENV=production requires either KMS_KEY_ID or a unique secret DEV_MASTER_KEY_HEX (cannot use the dev default key).'
      );
    }

    if (!parsed.DATABASE_URL?.trim()) {
      throw new Error(
        'FATAL [config]: NODE_ENV=production requires DATABASE_URL to be configured.'
      );
    }
  }

  // Derive a 256-bit vault KEK cleanly:
  // - If explicit 64-hex-char DEV_MASTER_KEY_HEX is set -> use directly.
  // - If Render `generateValue: true` base64 (>=32 chars) is set -> SHA-256 to 64 hex chars.
  // - If omitted in production -> HKDF-SHA256 domain-separated from the strong JWT_SECRET so existing Render deploys never crash on boot.
  // - In dev/test -> fall back to DEV_DEFAULT_MASTER_KEY_HEX.
  let normalizedMasterKeyHex = parsed.DEV_MASTER_KEY_HEX?.trim() || '';
  if (!normalizedMasterKeyHex) {
    if (parsed.NODE_ENV === 'production') {
      normalizedMasterKeyHex = Buffer.from(
        crypto.hkdfSync(
          'sha256',
          parsed.JWT_SECRET,
          'itinbee-dpdpa-vault-salt-v1',
          'aes-256-gcm-kek',
          32
        )
      ).toString('hex');
    } else {
      normalizedMasterKeyHex = DEV_DEFAULT_MASTER_KEY_HEX;
    }
  } else if (
    !/^[0-9a-fA-F]{64}$/.test(normalizedMasterKeyHex) &&
    normalizedMasterKeyHex.length >= 32
  ) {
    normalizedMasterKeyHex = crypto
      .createHash('sha256')
      .update(normalizedMasterKeyHex, 'utf8')
      .digest('hex');
  }

  const resolvedPort =
    parsed.PORT ?? (parsed.NODE_ENV === 'production' ? 10000 : 4000);

  const originSet = new Set<string>();
  for (const item of parsed.CORS_ORIGINS.split(',')) {
    const trimmed = item.trim().replace(/\/+$/, '');
    if (trimmed) {
      // Avoid keeping localhost in production CORS unless explicitly configured via APP_PUBLIC_URL
      if (parsed.NODE_ENV === 'production' && trimmed.startsWith('http://localhost')) {
        continue;
      }
      originSet.add(trimmed);
    }
  }
  const appPub = parsed.APP_PUBLIC_URL?.trim().replace(/\/+$/, '');
  if (
    appPub &&
    !(parsed.NODE_ENV === 'production' && appPub.startsWith('http://localhost'))
  ) {
    originSet.add(appPub);
  }
  for (const hostOrigin of expandHostToOrigins(parsed.FRONTEND_HOST)) {
    originSet.add(hostOrigin);
  }

  const corsOriginList = [...originSet];

  const overpassEndpointList = parsed.OVERPASS_ENDPOINTS.split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    ...parsed,
    DEV_MASTER_KEY_HEX: normalizedMasterKeyHex,
    resolvedPort,
    corsOriginList,
    overpassEndpointList,
  };
}

export const env = loadEnv();
