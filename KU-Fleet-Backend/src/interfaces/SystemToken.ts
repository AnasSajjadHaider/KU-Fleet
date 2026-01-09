import { Document } from "mongoose";

export interface ISystemToken extends Document {
  provider: "MTX";
  token: string;
  expiresAt: Date;
  updatedAt: Date;
  createdAt: Date;
}
