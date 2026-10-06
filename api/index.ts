import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { createApp } from './app.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const port = Number(process.env.PORT ?? 3001);
const app = createApp();

app.listen(port, '127.0.0.1', () => {
  console.log(`[hris-api] listening on http://127.0.0.1:${port}`);
});
