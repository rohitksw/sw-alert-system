// src/config/env.ts
import dotenv from 'dotenv';
dotenv.config();

export const {
  PORT,
  MONGO_URI,
  REDIS_URI,
  JWT_SECRET,
  REDIS_ALERT_CHANNEL,
} = process.env as { [key: string]: string };