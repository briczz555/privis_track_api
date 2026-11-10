import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_ACCESS_TTL: z.coerce.number().int().positive().default(900),
  JWT_REFRESH_SECRET: z.string().min(16),
  JWT_REFRESH_TTL: z.coerce.number().int().positive().default(604800),
  APP_BASE_URL: z.string().url().optional(),
  TRUST_PROXY: z.coerce.number().int().nonnegative().default(0),
  MAX_UPLOAD_MB: z.coerce.number().int().positive().default(20),
  CORS_ORIGINS: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const parsed = envSchema.safeParse(config);

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Environment tidak valid → ${details}`);
  }

  return { ...config, ...parsed.data };
}
