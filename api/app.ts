import express from 'express';
import cors from 'cors';
import { createCorsOptions } from '../server/security/cors.js';
import assetManagementLaunch from './apps/asset-management/asset-management-launch.js';

export function createApp() {
  const app = express();

  app.use(cors(createCorsOptions()));
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.status(200).json({ ok: true });
  });

  app.use(assetManagementLaunch);

  return app;
}
