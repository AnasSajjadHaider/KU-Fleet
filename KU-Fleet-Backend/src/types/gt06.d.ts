// src/types/gt06.d.ts
declare module "gt06" {
    export interface Gt06Event {
      number: number;
      string: string;
    }
  
    export interface Gt06Message {
      expectsResponse: boolean;
      terminalInfo?: {
        status: boolean;
        ignition: boolean;
        charging: boolean;
        alarmType: string;
        gpsTracking: boolean;
        relayState: boolean;
      };
      voltageLevel?: string;
      gsmSigStrength?: string;
      imei: string | number;
      responseMsg?: Buffer;
      event: Gt06Event;
      parseTime: number;
      gps?: {
        lat?: number;
        lng?: number;
        speed?: number;
        timestamp?: string | number | Date;
      };
      msgBuffer?: any;
      [key: string]: any;
    }
  
    export default class Gt06 {
      msgBuffer: Gt06Message[];
      expectsResponse: boolean;
      responseMsg?: Buffer;
      parse(data: Buffer | string): void;
      clearMsgBuffer(): void;
    }
  }
  