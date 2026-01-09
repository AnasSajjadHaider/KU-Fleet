import { getValidMtxToken } from "./getValidMtxToken";

export const buildCameraStreamUrl = async (
    deviceId: string,
    channelId = 1
  ) => {
    const token = await getValidMtxToken();
  
    return `https://www.mettaxiot.com/h5/#/live/v2` +
      `?deviceId=${deviceId}` +
      `&channelId=${channelId}` +
      `&token=${token}` +
      `&v=2` +
      `&bitStream=1` +
      `&streaming=${process.env.MTX_STREAMING_NODE}` +
      `&showTop=true` +
      `&showBottom=true` +
      `&decoder=wcs`;
  };
  
