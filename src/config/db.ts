// src/config/db.ts
import mongoose from 'mongoose';
import { MONGO_URI } from './env';

export const connectDB = async () => {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅ MongoDB Connected...');
  } catch (err) {
    const error = err as Error;
    console.error(`❌ MongoDB Connection Error: ${error.message}`);
    // Exit process with failure
    process.exit(1);
  }
};