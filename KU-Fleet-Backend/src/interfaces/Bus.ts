import { Document, Types } from "mongoose";
export interface IBusCamera {
  deviceId?: string;     // K18 deviceId / IMEI
  token?: string;        // H5 token
  channels?: number[];   // default [1, 2]
}
export interface IBus extends Document {
  busNumber: string;
  busNumberPlate: string;
  capacity: number;
  driver?: Types.ObjectId;
  route?: Types.ObjectId;
  trackerIMEI?: string;
  status: "active" | "inactive" | "maintenance";
  lastKnownLocation?: {
    lat: number;
    lng: number;
    speed: number;
    timestamp: Date;
  };
  lastLocation?: {
    lat: number;
    lng: number;
  };
  lastUpdate?: Date;
  photo?: {
    url: string;
    publicId: string;
  };
  camera?: IBusCamera;
}
