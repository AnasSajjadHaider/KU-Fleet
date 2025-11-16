// src/types/gt06.d.ts
declare module "gt06" {
    export interface TerminalInfo {
      status: boolean;
      ignition: boolean;
      charging: boolean;
      alarmType: string; // e.g., 'normal', 'panic', etc.
      gpsTracking: boolean;
      relayState: boolean;
    }
  
    export interface Gt06Event {
      number: number;
      string: string; // 'gps', 'status', 'alarm', etc.
    }
  
    export interface Gt06Message {
      expectsResponse: boolean;
      terminalInfo?: TerminalInfo;
      voltageLevel?: string;
      gsmSigStrength?: string;
      imei: string | number;
      responseMsg?: Buffer;
      event: Gt06Event;
      parseTime: number;
      gps?: {
        lat: number;
        lng: number;
        speed?: number;
        timestamp?: Date;
      };
      [key: string]: any; // allow extra fields if needed
    }
  
    export class Gt06 {
      msgBuffer: Gt06Message[];
      expectsResponse: boolean;
      responseMsg?: Buffer;
  
      parse(data: Buffer | string): void;
      clearMsgBuffer(): void;
    }
  
    export default Gt06;
  }
  