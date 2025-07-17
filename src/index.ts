// src/index.ts
import express from 'express';
import http from 'http';
import { PORT } from './config/env';
import { connectDB } from './config/db';
import { connectRedis } from './config/redis';
import { initializeWebSocket } from './services/websocket.service';
import apiRoutes from './api/routes';

const main = async () => {
  // --- Initialize Connections ---
  await connectDB();
  await connectRedis();

  // --- Setup Express App ---
  const app = express();
  app.use(express.json());

  // --- API Routes ---
  app.use('/api', apiRoutes);

  app.get('/', (req, res) => res.send('Alert System is Alive!'));

  // --- Create HTTP Server ---
  const server = http.createServer(app);

  // --- Initialize WebSocket Server ---
  initializeWebSocket(server);

  // --- Start Server ---
  server.listen(PORT, () => {
    console.log(`🚀 Server is running at http://localhost:${PORT}`);
  });
};

main().catch((err) => {
  console.error('💥 Failed to start server:', err);
});