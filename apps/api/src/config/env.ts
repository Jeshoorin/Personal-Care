import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import { z } from "zod";

const currentDir = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(currentDir, "../../.env");
dotenv.config({ path: envPath });

const optionalUrl = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}, z.string().url().optional());

const optionalString = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}, z.string().optional());

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().optional(),
  API_PORT: z.coerce.number().optional(),
  API_BASE_URL: optionalUrl,
  WEB_ORIGIN: optionalUrl,
  RENDER_EXTERNAL_URL: optionalUrl,

  GOOGLE_CLIENT_ID: optionalString,
  GOOGLE_CLIENT_SECRET: optionalString,
  GOOGLE_REDIRECT_URI: optionalUrl,

  JWT_SECRET: z.string().default("dev-secret"),
  ENCRYPTION_KEY: z
    .string()
    .default("this-is-a-development-only-encryption-key-32"),
  DATABASE_URL: optionalString,

  VAPID_PUBLIC_KEY: optionalString,
  VAPID_PRIVATE_KEY: optionalString,
  VAPID_SUBJECT: optionalString,

  CRON_SECRET: optionalString
});

const parsed = envSchema.parse(process.env);
const resolvedPort = parsed.PORT ?? parsed.API_PORT ?? 4000;
const resolvedApiBaseUrl =
  parsed.API_BASE_URL ??
  parsed.RENDER_EXTERNAL_URL ??
  `http://localhost:${resolvedPort}`;
const resolvedWebOrigin = parsed.WEB_ORIGIN ?? "http://localhost:5173";
const resolvedGoogleRedirect =
  parsed.GOOGLE_REDIRECT_URI ?? `${resolvedApiBaseUrl}/auth/google/callback`;

export const env = {
  ...parsed,
  API_PORT: resolvedPort,
  API_BASE_URL: resolvedApiBaseUrl,
  WEB_ORIGIN: resolvedWebOrigin,
  GOOGLE_REDIRECT_URI: resolvedGoogleRedirect,
  hasGoogleOAuth:
    Boolean(parsed.GOOGLE_CLIENT_ID) &&
    Boolean(parsed.GOOGLE_CLIENT_SECRET) &&
    Boolean(resolvedGoogleRedirect)
};
