// src/api/routes/index.ts
import { Router } from 'express';
import { triggerAlert } from '../controllers/alert.controller';

const router = Router();

router.post('/trigger-alert', triggerAlert);

export default router;