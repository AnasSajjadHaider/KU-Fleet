import mongoose, { Schema } from "mongoose";
import { ISystemToken } from "../interfaces/SystemToken";

const systemTokenSchema = new Schema<ISystemToken>(
  {
    provider: {
      type: String,
      enum: ["MTX"],
      required: true,
      unique: true, // IMPORTANT: only ONE token per provider
    },
    token: {
      type: String,
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

/**
 * PERFORMANCE & SAFETY INDEXES
 */

// Fast lookup for MTX token
systemTokenSchema.index({ provider: 1 });


export default mongoose.model<ISystemToken>(
  "SystemToken",
  systemTokenSchema
);
