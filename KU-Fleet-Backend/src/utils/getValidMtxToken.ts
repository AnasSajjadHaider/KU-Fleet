import { createMtxToken } from "../controllers/mtxAuthController";
import SystemTokenModel from "../models/SystemToken.model";

let isRefreshing = false;
let refreshPromise: Promise<string> | null = null;

export const getValidMtxToken = async (): Promise<string> => {
  const now = new Date();
  const record = await SystemTokenModel.findOne({ provider: "MTX" });

  if (record && record.expiresAt > now) {
    return record.token;
  }

  if (!isRefreshing) {
    isRefreshing = true;
    refreshPromise = createMtxToken().finally(() => {
      isRefreshing = false;
      refreshPromise = null;
    });
  }

  return await refreshPromise!;
};
