import mongoose, { Schema, Document, Types } from "mongoose";

export interface ITripLog extends Document {
  bus: Types.ObjectId;
  driver?: Types.ObjectId;
  route?: Types.ObjectId;
  startTime: Date;
  endTime?: Date;
  coordinates: {
    lat: number;
    lng: number;
    speed?: number;
    timestamp?: Date;
  }[];
  distance?: number;
  duration?: number;       // NEW
  passengerCount: number;
  avgSpeed?: number;
  maxSpeed?: number;
  stopsCount?: number;
  status: "in_progress" | "completed" | "cancelled";
}

const tripLogSchema = new Schema<ITripLog>(
  {
    bus: { type: Schema.Types.ObjectId, ref: "Bus", required: true },
    driver: { type: Schema.Types.ObjectId, ref: "User" },
    route: { type: Schema.Types.ObjectId, ref: "Route" },
    startTime: { type: Date, required: true },
    endTime: { type: Date },
    coordinates: [
      {
        lat: Number,
        lng: Number,
        speed: Number,
        timestamp: { type: Date, default: Date.now },
      },
    ],
    distance: { type: Number, default: 0 },
    duration: { type: Number, default: 0 }, // NEW
    avgSpeed: { type: Number, default: 0 },
    maxSpeed: { type: Number, default: 0 },
    stopsCount: { type: Number, default: 0 },
    passengerCount: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ["in_progress", "completed", "cancelled"],
      default: "in_progress",
    },
  },
  { timestamps: true }
);

// Indexes for performance
tripLogSchema.index({ bus: 1, startTime: -1 });
tripLogSchema.index({ driver: 1 });
tripLogSchema.index({ route: 1 });
tripLogSchema.index({ status: 1 });

export default mongoose.model<ITripLog>("TripLog", tripLogSchema);
