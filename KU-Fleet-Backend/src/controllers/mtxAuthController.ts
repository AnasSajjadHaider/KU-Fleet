import axios from "axios";
import SystemTokenModel from "../models/SystemToken.model";


export const createMtxToken = async () => {
  const res = await axios.post(
    `${process.env.MTX_BASE_URL}/v2/openapi/system/createToken`,
    {
      apiKey: process.env.MTX_API_KEY,
      apiSecret: process.env.MTX_API_SECRET,
    },
    {
      headers: {
        Authorization: process.env.MTX_API_KEY!,
        "Content-Type": "application/json",
      },
    }
  );

  const token = res.data.data; // <-- STRING ONLY

  // SAFE expiry strategy:
  // MTX allows 48h, but inactivity kills in ~4h
  // We refresh every 3.5 hours
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + 3.5 * 60 * 60 * 1000);

  await SystemTokenModel.findOneAndUpdate(
    { provider: "MTX" },
    { token, expiresAt },
    { upsert: true, new: true }
  );

  return token;
};
