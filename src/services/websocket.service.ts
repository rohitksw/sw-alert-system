// src/services/websocket.service.ts

import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import { Device } from '../models/device.model';
import { redisSubscriber } from '../config/redis';
import { REDIS_ALERT_CHANNEL } from '../config/env';

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
    // The IP address can be found in different headers if behind a proxy.
    // This is a robust way to get the real client IP.
    let ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
    console.log(`[WebSocket] New client connected from IP: ${ip}`);

    // --- HEARTBEAT SETUP ---
    // A new connection is assumed to be alive initially.
    ws.isAlive = true;
    
    // The 'pong' event is fired in response to our 'ping'. This confirms the client is still connected.
    ws.on('pong', () => {
        console.log(`[Heartbeat] Received pong from client at IP ${ip}`);
      ws.isAlive = true;
    });
    // --- END HEARTBEAT SETUP ---

    // Listener for messages from this specific client
    ws.on('message', async (message: Buffer) => {
      try {
        const data = JSON.parse(message.toString());
        
        // Handle the 'register' message type
        if (data.type === 'register' && data.deviceId && data.ip) {
          const { deviceId } = data;
          ip = data.ip;
          console.log(`[WebSocket] Device ${deviceId} registering from IP ${ip}`);
          // Store the client in this server instance's local map
          clients.set(deviceId, { ws, ip });
          console.log(`[WebSocket] Device ${deviceId} registered locally from IP ${ip}. Total clients on this instance: ${clients.size}`);
          
          // Persist or update the device information in MongoDB for long-term storage
          await Device.findOneAndUpdate(
            { deviceId }, // Find by deviceId
            { deviceId, lastKnownIp: ip, lastSeen: new Date() }, // Data to update
            { upsert: true, new: true, setDefaultsOnInsert: true } // Options: create if it doesn't exist
          );
          
          // Send a confirmation message back to the client
          ws.send(JSON.stringify({ type: 'registered', status: 'success' }));
        } else {
          console.warn(`[WebSocket] Received unknown message type from a client: ${data.type}`);
        }
      } catch (error) {
        console.error('[WebSocket] Failed to process message:', message.toString(), error);
      }
    });

    // Listener for when this client's connection is closed
    ws.on('close', () => {
      // Find the disconnected client by its WebSocket instance and remove it from our local map.
      for (const [deviceId, clientData] of clients.entries()) {
        if (clientData.ws === ws) {
          clients.delete(deviceId);
          console.log(`[WebSocket] Client ${deviceId} disconnected. Total clients on this instance: ${clients.size}`);
          break; // Exit loop once found
        }
      }
    });

    // Listener for any errors that occur on this connection
    ws.on('error', (error) => {
      console.error('[WebSocket] A connection error occurred:', error);
    });
  });

  // --- HEARTBEAT INTERVAL ---
  // This interval runs periodically to check for and clean up dead connections.
  const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
      const extWs = ws as IExtendedWebSocket;

      // If isAlive is false, it means the client did not respond to the last ping.
      if (extWs.isAlive === false) {
        console.warn('[Heartbeat] Terminating dead connection due to no pong response.');
        return extWs.terminate(); // Forcefully close the unresponsive connection.
      }

      // Reset the flag to false and send a new ping.
      // The client must respond with a pong before the next interval runs to be considered alive.
      extWs.isAlive = false;
      extWs.ping(() => { console.log(`Sending ping to client`) }); // The callback is optional but good practice.
    });
  }, 30000); // Run this check every 30 seconds

  // Clean up the interval when the WebSocket server itself is closed.
  wss.on('close', () => {
    clearInterval(interval);
  });
  // --- END HEARTBEAT INTERVAL ---

  // --- REDIS SUBSCRIBER ---
  // Subscribe to the Redis channel to receive alert messages published by the API.
  redisSubscriber.subscribe(REDIS_ALERT_CHANNEL, (message) => {
    console.log(`[Redis] Received alert from channel '${REDIS_ALERT_CHANNEL}'`);
    try {
      // Parse the message which contains the target IP and the alert payload
      const { targetIp, payload } = JSON.parse(message);
      if (targetIp && payload) {
        // Broadcast the alert to all relevant clients connected to THIS server instance.
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
  // Iterate through this server instance's client map
  for (const [deviceId, clientData] of clients.entries()) {
    // Check if the client's IP matches the target and its connection is open
    if (clientData.ip === targetIp && clientData.ws.readyState === WebSocket.OPEN) {
      clientData.ws.send(JSON.stringify(payload));
      sentCount++;
    }
  }
  if (sentCount > 0) {
    console.log(`[WebSocket] Successfully broadcasted alert to ${sentCount} local clients for IP ${targetIp}`);
  }
};