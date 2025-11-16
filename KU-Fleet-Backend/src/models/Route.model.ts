import mongoose, { Schema } from "mongoose";
import { IRoute } from "../interfaces/Route";

const routeSchema = new Schema<IRoute>(
  {
    routeName: { type: String, required: true, unique: true },
    description: String,
    stations: [{ type: Schema.Types.ObjectId, ref: "Station" }],
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// PERFORMANCE: Add indexes for route queries
// Note: routeName already has index from unique: true, don't duplicate
routeSchema.index({ active: 1 });

export default mongoose.model<IRoute>("Route", routeSchema);
