import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { createApp } from './app.js';

const isVercel = Boolean(process.env.VERCEL);

// Local only — Vercel injects env vars; .env is for `npm run dev:api`.
if (!isVercel) {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  dotenv.config({ path: path.resolve(__dirname, '../.env') });
}

const app = createApp();

if (!isVercel) {
  const port = Number(process.env.PORT ?? 3001);
  app.listen(port, '127.0.0.1', () => {
    console.log(`[hris-api] listening on http://127.0.0.1:${port}`);
  });
}

/** Vercel serverless entry — do not call listen() on Vercel. */
export default app;
