import mongoose, { Schema } from "mongoose";
import { IBus } from "../interfaces/Bus";

const busSchema = new Schema<IBus>(
  {
    busNumber: { type: String, required: true, unique: true },
    busNumberPlate: { type: String, required: true, unique: true },
    capacity: { type: Number, default: 50 },
    driver: { type: Schema.Types.ObjectId, ref: "User", required: true },
    route: { type: Schema.Types.ObjectId, ref: "Route", required: true },
    trackerIMEI: { type: String, unique: true, sparse: true },
    status: {
      type: String,
      enum: ["active", "inactive", "maintenance"],
      default: "active",
    },
    lastKnownLocation: {
      lat: Number,
      lng: Number,
      speed: Number,
      timestamp: Date,
    },
    lastLocation: {
      lat: Number,
      lng: Number,
    },
    lastUpdate: Date,
    photo: {
      url: String,
      publicId: String,
    },
    // add this inside busSchema fields
    camera: {
      deviceId: { type: String },          // fixed hardware id
      channels: { type: [Number], default: [1] }
    }
    

  },
  { timestamps: true }
);

// PERFORMANCE: Add indexes for frequently queried fields
// Note: trackerIMEI already has index from unique: true, don't duplicate
// Index on status for filtering active/inactive buses
busSchema.index({ status: 1 });

// Index on route for route-based queries
busSchema.index({ route: 1 });

// Index on driver for driver assignment queries
busSchema.index({ driver: 1 });

// Compound index for status + route queries (common in analytics)
busSchema.index({ status: 1, route: 1 });

export default mongoose.model<IBus>("Bus", busSchema);
