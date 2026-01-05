import { Document, Types } from "mongoose";

export interface IRoute extends Document {
  routeName: string;
  description?: string;
  stations: Types.ObjectId[]; // stays as ObjectId[], not populated
  active: boolean;
}
