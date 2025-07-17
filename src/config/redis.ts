// src/config/redis.ts
import { createClient } from 'redis';
import { REDIS_URI } from './env';

// Client for publishing messages
export const redisPublisher = createClient({ url: REDIS_URI });

// Client for subscribing to messages. A dedicated client is needed for this.
export const redisSubscriber = redisPublisher.duplicate();

export const connectRedis = async () => {
  try {
    await redisPublisher.connect();
    await redisSubscriber.connect();
    console.log('✅ Redis Connected...');
  } catch (err) {
    const error = err as Error;
    console.error(`❌ Redis Connection Error: ${error.message}`);
    process.exit(1);
  }
};