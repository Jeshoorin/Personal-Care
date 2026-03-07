import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import { z } from "zod";

const currentDir = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(currentDir, "../../.env");
dotenv.config({ path: envPath });

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().default(4000),
  API_BASE_URL: z.string().url().default("http://localhost:4000"),
  WEB_ORIGIN: z.string().url().default("http://localhost:5173"),

  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REDIRECT_URI: z.string().url().optional(),

  JWT_SECRET: z.string().default("dev-secret"),
  ENCRYPTION_KEY: z
    .string()
    .default("this-is-a-development-only-encryption-key-32"),
  DATABASE_URL: z.string().optional(),

  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().optional(),

  CRON_SECRET: z.string().optional()
});

const parsed = envSchema.parse(process.env);

export const env = {
  ...parsed,
  hasGoogleOAuth:
    Boolean(parsed.GOOGLE_CLIENT_ID) &&
    Boolean(parsed.GOOGLE_CLIENT_SECRET) &&
    Boolean(parsed.GOOGLE_REDIRECT_URI)
};
