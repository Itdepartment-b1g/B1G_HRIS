import { Router } from 'express';
import { launchAssetManagement } from '../../../server/controllers/app/asset-management/asset-management-controller.js';

const router = Router();

/** GET /apps/asset-management/launch — thin route → controller */
router.get('/apps/asset-management/launch', launchAssetManagement);

export default router;
