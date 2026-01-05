import { Document, Types } from "mongoose";

export interface IUser extends Document {
  _id: Types.ObjectId;
  name: string;
  email: string;
  password: string;
  role: "admin" | "driver" | "student" | "parent";
  phone?: string;
  contactInfo?: string;
  age?: number;
  cnic?:string;
  licenseNumber?:string;
  experienceYears?: number;
  licenseImage?: string;
  rfidCardUID?: string;
  remarks?:string;
  assignedBus?: Types.ObjectId;
  parentOf?: Types.ObjectId[];
  status: "active" | "inactive";
  photo?: string;
}
