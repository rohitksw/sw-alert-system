// src/models/device.model.ts
import { Schema, model, Document } from 'mongoose';

export interface IDevice extends Document {
  deviceId: string;
  lastKnownIp: string;
  lastSeen: Date;
}

const deviceSchema = new Schema<IDevice>({
  deviceId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  lastKnownIp: {
    type: String,
    required: true,
  },
  lastSeen: {
    type: Date,
    default: Date.now,
  },
}, { timestamps: true });

export const Device = model<IDevice>('Device', deviceSchema);