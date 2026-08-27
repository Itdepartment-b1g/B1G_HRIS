import type { CorsOptions } from 'cors';

/**
 * CORS config for the Express API.
 * Origins from CORS_ORIGIN / VITE_APP_ORIGIN (comma-separated), default localhost:8080.
 */
export function createCorsOptions(): CorsOptions {
  const allowedOrigins = (process.env.CORS_ORIGIN ?? process.env.VITE_APP_ORIGIN ?? 'http://localhost:8080')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  return {
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: true,
  };
}
