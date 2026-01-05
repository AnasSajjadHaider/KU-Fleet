import mongoose, { Schema } from "mongoose";
import { IUser } from "../interfaces/User";

const userSchema = new Schema<IUser>(
  {
    name: { type: String, required: true },
    email: { type: String }, // optional for students without email
    password: { type: String },

    role: {
      type: String,
      enum: ["admin", "driver", "student", "parent"],
      default: "student",
    },

    phone: String,
    contactInfo: String,
    age: Number,
    experienceYears: Number,
    cnic: { type: String },
    licenseNumber: { type: String },
    licenseImage: { type: String }, // Cloudinary URL
    photo: { type: String }, // Profile photo

    rfidCardUID: { type: String, unique: true, sparse: true },
    assignedBus: { type: Schema.Types.ObjectId, ref: "Bus" },
    parentOf: [{ type: Schema.Types.ObjectId, ref: "User" }],

    status: { type: String, enum: ["active", "inactive"], default: "active" },
    remarks: String, // admin notes
  },
  { timestamps: true }
);

// ----------------------
// INDEXES
// ----------------------

// Sparse unique index for email to allow multiple nulls
userSchema.index({ email: 1 }, { unique: true, sparse: true });

// Index on role for role-based queries
userSchema.index({ role: 1 });

// Index on status for filtering active/inactive users
userSchema.index({ status: 1 });

// Index on assignedBus for driver-bus lookups
userSchema.index({ assignedBus: 1 }, { sparse: true });

// Index on rfidCardUID for RFID lookups (already unique, explicit)
userSchema.index({ rfidCardUID: 1 }, { unique: true, sparse: true });

// Compound index for role + status queries
userSchema.index({ role: 1, status: 1 });

export default mongoose.model<IUser>("User", userSchema);
