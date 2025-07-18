// src/api/routes/index.ts
import { Router } from 'express';
import { triggerAlert, getDevices  } from '../controllers/alert.controller';
import { authenticateToken } from '../middleware/auth.middleware';

const router = Router();

router.post('/trigger-alert',authenticateToken, triggerAlert);
router.get('/devices',authenticateToken, getDevices);
export default router;