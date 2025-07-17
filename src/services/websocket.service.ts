// src/services/websocket.service.ts
import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import { Device } from '../models/device.model';
import { redisSubscriber } from '../config/redis';
import { REDIS_ALERT_CHANNEL } from '../config/env';

// This map stores clients connected to THIS server instance only.
// Map<deviceId, { ws: WebSocket, ip: string }>
const clients = new Map<string, { ws: WebSocket; ip: string }>();

export const initializeWebSocket = (server: Server) => {
  const wss = new WebSocketServer({ server });

  wss.on('connection', (ws: WebSocket, req) => {
    const ip = req.socket.remoteAddress || 'unknown';
    console.log(`[WebSocket] New client connected from IP: ${ip}`);

    ws.on('message', async (message: Buffer) => {
      try {
        const data = JSON.parse(message.toString());

        if (data.type === 'register' && data.deviceId) {
          const { deviceId } = data;

          // Store client locally for this server instance
          clients.set(deviceId, { ws, ip });
          console.log(`[WebSocket] Device ${deviceId} registered locally from IP ${ip}. Total clients on this instance: ${clients.size}`);
          
          // Persist/Update device info in MongoDB
          await Device.findOneAndUpdate(
            { deviceId },
            { deviceId, lastKnownIp: ip, lastSeen: new Date() },
            { upsert: true, new: true } // Upsert: create if not exists
          );
          
          ws.send(JSON.stringify({ type: 'registered', status: 'success' }));
        }
      } catch (error) {
        console.error('[WebSocket] Failed to process message:', error);
      }
    });

    ws.on('close', () => {
      // Find and remove the disconnected client from the local map
      for (const [deviceId, clientData] of clients.entries()) {
        if (clientData.ws === ws) {
          clients.delete(deviceId);
          console.log(`[WebSocket] Client ${deviceId} disconnected. Total clients on this instance: ${clients.size}`);
          break;
        }
      }
    });

    ws.on('error', (error) => {
      console.error('[WebSocket] Error:', error);
    });
  });

  // Subscribe to the Redis channel to receive alert messages
  redisSubscriber.subscribe(REDIS_ALERT_CHANNEL, (message) => {
    console.log(`[Redis] Received alert from channel '${REDIS_ALERT_CHANNEL}'`);
    try {
      const { targetIp, payload } = JSON.parse(message);
      sendAlertToLocalClients(targetIp, payload);
    } catch (error) {
      console.error('[Redis] Error parsing alert message:', error);
    }
  });

  console.log('🔌 WebSocket Server initialized and listening for connections.');
};

/**
 * Sends an alert to all locally connected clients matching the target IP.
 * @param targetIp The IP address to target.
 * @param payload The alert data to send.
 */
const sendAlertToLocalClients = (targetIp: string, payload: any) => {
  let sentCount = 0;
  for (const [deviceId, clientData] of clients.entries()) {
    if (clientData.ip === targetIp && clientData.ws.readyState === WebSocket.OPEN) {
      clientData.ws.send(JSON.stringify(payload));
      sentCount++;
    }
  }
  if (sentCount > 0) {
    console.log(`[WebSocket] Broadcasted alert to ${sentCount} local clients for IP ${targetIp}`);
  }
};