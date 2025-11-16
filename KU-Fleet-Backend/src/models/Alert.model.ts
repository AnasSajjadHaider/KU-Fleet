import mongoose, { Schema } from "mongoose";
import { IAlert } from "../interfaces/Alert";

const alertSchema = new Schema<IAlert>(
  {
    bus: { type: Schema.Types.ObjectId, ref: "Bus", required: true },
    type: { 
      type: String, 
      enum: ["panic", "overspeed", "routeDeviation", "system", "other"], 
      default: "other" 
    },
    message: String,
    priority: { type: String, enum: ["low", "medium", "high"], default: "medium" },
    resolved: { type: Boolean, default: false }, 
    timestamp: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// PERFORMANCE: Indexes for alert queries
// Compound index for bus + type + timestamp (already exists, but optimized)
alertSchema.index({ bus: 1, type: 1, timestamp: -1 });

// Index on resolved status for filtering unresolved alerts
alertSchema.index({ resolved: 1 });

// Index on priority for priority-based queries
alertSchema.index({ priority: 1 });

// Index on timestamp for time-based queries
alertSchema.index({ timestamp: -1 });

// Compound index for resolved + timestamp (common in alert queries)
alertSchema.index({ resolved: 1, timestamp: -1 });

export default mongoose.model<IAlert>("Alert", alertSchema);
