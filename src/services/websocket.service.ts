// src/services/websocket.service.ts

import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import { URLSearchParams } from 'url';
import jwt from 'jsonwebtoken'; // <-- Import JWT library
import { Device } from '../models/device.model';
import { redisSubscriber } from '../config/redis';
import { REDIS_ALERT_CHANNEL, JWT_SECRET } from '../config/env';

/**
 * We extend the base WebSocket type to include our custom 'isAlive' property.
 * This is essential for the heartbeat mechanism.
 */
interface IExtendedWebSocket extends WebSocket {
  isAlive: boolean;
}

/**
 * This Map stores the WebSocket clients connected to THIS specific server instance.
 * In a multi-server environment, each server will have its own 'clients' Map.
 * The structure is: Map<deviceId, { ws: IExtendedWebSocket, ip: string }>
 */
const clients = new Map<string, { ws: IExtendedWebSocket; ip: string }>();

/**
 * Initializes the WebSocket server, attaches it to the main HTTP server,
 * and sets up all event listeners for connections, messages, and heartbeats.
 * @param server The main HTTP server instance.
 */
export const initializeWebSocket = (server: Server) => {
  const wss = new WebSocketServer({ server });

  wss.on('connection', (ws: IExtendedWebSocket, req) => {
    // --- 1. TOKEN AUTHENTICATION (GATEKEEPER) ---
    // This happens immediately upon connection attempt.
    try {
      const params = new URLSearchParams(req.url?.split('?')[1]);
      const token = params.get('token');

      if (!token) {
        // Close connection immediately if no token is provided
        ws.close(4001, 'Authentication Error: No token provided.');
        console.warn(`[Auth] Connection rejected. Reason: No token.`);
        return;
      }

      // Verify the token. This will throw an error if the token is invalid or expired.
      jwt.verify(token, JWT_SECRET);
      console.log(`[Auth] Client successfully authenticated.`);

    } catch (error) {
      // Close connection immediately if token is invalid
      ws.close(4003, 'Authentication Error: Invalid token.');
      console.warn(`[Auth] Connection rejected. Reason: Invalid token.`);
      return;
    }
    // --- END TOKEN AUTHENTICATION ---


    // The initial connection IP is still useful for logging before registration
    const connectionIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
    console.log(`[WebSocket] New authenticated client connected from (connection IP: ${connectionIp})`);


    // --- HEARTBEAT SETUP ---
    ws.isAlive = true;
    ws.on('pong', () => {
      // Note: We don't log the IP here as it's not set until registration.
      ws.isAlive = true;
    });

    // Listener for messages from this specific client
    ws.on('message', async (message: Buffer) => {
      try {
        const data = JSON.parse(message.toString());
        
        // --- 2. MODIFIED REGISTRATION LOGIC ---
        // We now expect the client to provide its deviceId AND its public IP address.
        if (data.type === 'register' && data.deviceId && data.ip) {
          console.log(`Data received from client: ${JSON.stringify(data)}`); 
          const { deviceId, ip } = data; // Get IP from the payload

          
          // Store the client with its client-provided IP
          clients.set(deviceId, { ws, ip });
       
          console.log(`[WebSocket] Device ${deviceId} registered with provided IP ${ip}. Total clients on this instance: ${clients.size}`);
          
          // Persist to MongoDB using the client-provided IP
          await Device.findOneAndUpdate(
            { deviceId },
            { deviceId, lastKnownIp: ip, lastSeen: new Date() },
            { upsert: true, new: true, setDefaultsOnInsert: true }
          );
          
          ws.send(JSON.stringify({ type: 'registered', status: 'success' }));
        } else {
          console.warn(`[WebSocket] Received invalid registration message from an authenticated client.`);
        }
      } catch (error) {
        console.error('[WebSocket] Failed to process message:', message.toString(), error);
      }
    });

    ws.on('close', () => {
      for (const [deviceId, clientData] of clients.entries()) {
        if (clientData.ws === ws) {
          clients.delete(deviceId);
          console.log(`[WebSocket] Client ${deviceId} disconnected. Total clients on this instance: ${clients.size}`);
          break;
        }
      }
    });

    ws.on('error', (error) => console.error('[WebSocket] A connection error occurred:', error));
  });

  // --- HEARTBEAT INTERVAL (No changes needed here) ---
  const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
      const extWs = ws as IExtendedWebSocket;
      if (extWs.isAlive === false) {
        console.warn('[Heartbeat] Terminating dead connection due to no pong response.');
        return extWs.terminate(); // Forcefully close the unresponsive connection.
      }
      extWs.isAlive = false;
      extWs.ping();
    });
  }, 30000);

  wss.on('close', () => clearInterval(interval));
  
  // --- REDIS SUBSCRIBER (No changes needed here) ---
  redisSubscriber.subscribe(REDIS_ALERT_CHANNEL, (message) => {
    console.log(`[Redis] Received alert from channel '${REDIS_ALERT_CHANNEL}'`);
    try {
      const { targetIp, payload } = JSON.parse(message);
      if (targetIp && payload) {
        sendAlertToLocalClients(targetIp, payload);
      }
    } catch (error) {
      console.error('[Redis] Error parsing or handling alert message from Redis:', error);
    }
  });

  console.log('🔌 WebSocket Server initialized with persistence and Redis subscription.');
};

/**
 * Sends an alert payload to all locally connected clients that match the target IP address.
 * @param targetIp The IP address to target for the alert.
 * @param payload The alert data object to be sent to the clients.
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