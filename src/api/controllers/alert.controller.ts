// src/api/controllers/alert.controller.ts
import { Request, Response } from 'express';
import { redisPublisher } from '../../config/redis';
import { REDIS_ALERT_CHANNEL } from '../../config/env';

export const triggerAlert = async (req: Request, res: Response) => {
  const { ip: targetIp, message, title } = req.body;

  if (!targetIp || !message) {
    return res.status(400).json({ error: 'Fields "ip" and "message" are required.' });
  }

  // This is the payload that will be sent to the mobile clients
  const alertPayload = {
    type: 'alert',
    title: title || 'EMERGENCY ALERT',
    message,
    timestamp: new Date().toISOString(),
  };

  // The message to publish via Redis
  const redisMessage = JSON.stringify({
    targetIp,
    payload: alertPayload,
  });

  try {
    // Publish the message to the Redis channel.
    // All subscribed server instances will receive this.
    await redisPublisher.publish(REDIS_ALERT_CHANNEL, redisMessage);
    
    console.log(`[HTTP] Alert for IP ${targetIp} published to Redis channel.`);
    res.status(200).json({ status: 'success', message: 'Alert trigger has been broadcasted.' });
  } catch (error) {
    console.error('[HTTP] Failed to publish alert to Redis:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
};