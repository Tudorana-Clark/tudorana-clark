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
  // Microsoft Entra ID single sign-on for the studio (preferred over the password when set).
  ENTRA_TENANT_ID: z.string().default(""),
  ENTRA_CLIENT_ID: z.string().default(""),
  ENTRA_CLIENT_SECRET: z.string().default(""),
  STUDIO_ALLOWED_OIDS: z.string().default(""),
  STUDIO_LOGIN_HINT: z.string().default("daniel@tudoranaclark.com"),
  API_TIMEOUT_MS: z.coerce.number().int().positive().default(8000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  throw new Error(`Invalid server environment: ${z.prettifyError(parsed.error)}`);
}

export const env = parsed.data;

/** Password sign-in is only a fallback for environments without SSO. */
export function passwordLoginEnabled(): boolean {
  const sso = Boolean(env.ENTRA_TENANT_ID && env.ENTRA_CLIENT_ID && env.ENTRA_CLIENT_SECRET && env.STUDIO_ALLOWED_OIDS);
  return !sso && env.ADMIN_PASSWORD.length >= 12 && env.SESSION_SECRET.length >= 32 && env.ADMIN_API_KEY.length > 0;
}
