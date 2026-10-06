import type { CorsOptions } from 'cors';

/**
 * CORS config for the Express API.
 * Origins from CORS_ORIGIN / VITE_APP_ORIGIN (comma-separated), default localhost:8080.
 */
export function createCorsOptions(): CorsOptions {
  const fromEnv = (process.env.CORS_ORIGIN ?? process.env.VITE_APP_ORIGIN ?? 'http://localhost:8080')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  const allowedOrigins = new Set(fromEnv);

  // Auto-allow this Vercel deployment (preview + production host).
  const vercelUrl = (process.env.VERCEL_URL ?? '').trim();
  if (vercelUrl) {
    allowedOrigins.add(vercelUrl.startsWith('http') ? vercelUrl : `https://${vercelUrl}`);
  }
  const vercelProd = (process.env.VERCEL_PROJECT_PRODUCTION_URL ?? '').trim();
  if (vercelProd) {
    allowedOrigins.add(vercelProd.startsWith('http') ? vercelProd : `https://${vercelProd}`);
  }

  return {
    origin(origin, callback) {
      if (!origin || allowedOrigins.has('*') || allowedOrigins.has(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: true,
  };
}
