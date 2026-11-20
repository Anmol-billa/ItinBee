import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().optional(),
  CORS_ORIGINS: z.string().default('http://localhost:3000,https://itinbee.com'),
  JWT_SECRET: z.string().min(16).default('dev-itinbee-hmac-secret-change-in-production-32chars'),
  DATABASE_URL: z.string().optional(),
  REDIS_URL: z.string().optional(),
  RUN_INLINE_WORKER: z
    .string()
    .optional()
    .transform((v) => (v === undefined ? true : v === 'true' || v === '1')),
  LOCAL_DEV_STORE_FILE: z.string().optional(),
  AWS_S3_VAULT_REGION: z.string().default('ap-south-1'),
  AWS_S3_VAULT_BUCKET: z.string().default('itinbee-vault-ap-south-1'),
  KMS_KEY_ID: z.string().optional(),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  DEV_MASTER_KEY_HEX: z
    .string()
    .default('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'),
  GCP_VERTEX_LOCATION: z.string().default('asia-south1'),
  GCP_VERTEX_PROJECT_ID: z.string().optional(),
  GOOGLE_VERTEX_API_KEY: z.string().optional(),
  TURNSTILE_SECRET_KEY: z.string().optional(),
  PHOTON_BASE_URL: z.string().optional(),
});

export type AppEnv = z.infer<typeof EnvSchema> & {
  resolvedPort: number;
  corsOriginList: string[];
};

export function loadEnv(overrides: Record<string, string | undefined> = {}): AppEnv {
  const merged = { ...process.env, ...overrides };
  const parsed = EnvSchema.parse(merged);
  const resolvedPort =
    parsed.PORT ?? (parsed.NODE_ENV === 'production' ? 10000 : 4000);
  const corsOriginList = parsed.CORS_ORIGINS.split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    ...parsed,
    resolvedPort,
    corsOriginList,
  };
}

export const env = loadEnv();
