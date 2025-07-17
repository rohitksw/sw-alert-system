// src/api/routes/index.ts
import { Router } from 'express';
import { triggerAlert, getDevices  } from '../controllers/alert.controller';

const router = Router();

router.post('/trigger-alert', triggerAlert);
router.get('/devices', getDevices);
export default router;