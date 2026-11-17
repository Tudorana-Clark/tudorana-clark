import "server-only";

import { z } from "zod";

/**
 * Server-side configuration, validated once. A missing value fails fast with a clear message
 * instead of surfacing as a confusing runtime error deep in a request.
 */
const schema = z.object({
  API_URL: z.url().default("http://localhost:8000"),
  ADMIN_API_KEY: z.string().default(""),
  ADMIN_PASSWORD: z.string().default(""),
  SESSION_SECRET: z.string().default(""),
  INDEXNOW_KEY: z.string().default(""),
  API_TIMEOUT_MS: z.coerce.number().int().positive().default(8000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  throw new Error(`Invalid server environment: ${z.prettifyError(parsed.error)}`);
}

export const env = parsed.data;

export function studioConfigured(): boolean {
  return env.ADMIN_PASSWORD.length >= 12 && env.SESSION_SECRET.length >= 32 && env.ADMIN_API_KEY.length > 0;
}
