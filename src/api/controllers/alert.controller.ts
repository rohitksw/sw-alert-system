// src/api/controllers/alert.controller.ts
import { Request, Response } from 'express';
import { redisPublisher } from '../../config/redis';
import { REDIS_ALERT_CHANNEL } from '../../config/env';
import { Device } from '../../models/device.model'; 
import { SortOrder } from 'mongoose';

export const triggerAlert = async (req: Request, res: Response) => {
  // --- MODIFIED: Expect 'ips' to be an array of strings ---
  const { ips, message, title } = req.body;

  // Validate the input
  if (!ips || !Array.isArray(ips) || ips.length === 0 || !message) {
    return res.status(400).json({ 
      error: 'Invalid request body. "ips" must be a non-empty array and "message" is required.' 
    });
  }

  // This is the payload that will be sent to the mobile clients
  const alertPayload = {
    type: 'alert',
    title: title || 'EMERGENCY ALERT',
    message,
    timestamp: new Date().toISOString(),
  };

  try {
    let publishedCount = 0;
    // --- MODIFIED: Loop through the array of IPs ---
    for (const targetIp of ips) {
      if (typeof targetIp === 'string' && targetIp.length > 0) {
        // The message to publish via Redis
        const redisMessage = JSON.stringify({
          targetIp, // Publish for each individual IP
          payload: alertPayload,
        });

        // Publish the message to the Redis channel.
        await redisPublisher.publish(REDIS_ALERT_CHANNEL, redisMessage);
        publishedCount++;
        console.log(`[HTTP] Alert for IP ${targetIp} published to Redis channel.`);
      }
    }
    
    res.status(200).json({ 
      status: 'success', 
      message: `Alert trigger has been broadcasted for ${publishedCount} IP(s).` 
    });
  } catch (error) {
    console.error('[HTTP] Failed to publish alert to Redis:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
};

export const getDevices = async (req: Request, res: Response) => {
  try {
    // --- Pagination Parameters ---
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    // --- Filtering Parameters ---
    const filter: { lastKnownIp?: string } = {};
    if (req.query.ip) {
      filter.lastKnownIp = req.query.ip as string;
    }

    // --- Sorting Parameters (Corrected) ---
    const sortBy = (req.query.sortBy as string) || 'lastSeen';
    const sortOrder: SortOrder = req.query.sortOrder === 'asc' ? 1 : -1;
    
    // **THE FIX:** Create the sort object with an explicit type definition.
    // This tells TypeScript that our object with a dynamic key is a valid sort object.
    const sort: { [key: string]: SortOrder } = { [sortBy]: sortOrder };

    // --- Database Queries ---
    const [devices, total] = await Promise.all([
      Device.find(filter)
        .sort(sort) // <-- Now TypeScript is happy with this.
        .skip(skip)
        .limit(limit)
        .select('-__v'),
      Device.countDocuments(filter),
    ]);
    
    // --- Construct and Send the Response ---
    res.status(200).json({
      totalDevices: total,
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      devices,
    });
  } catch (error) {
    console.error('[HTTP] Error fetching devices:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};