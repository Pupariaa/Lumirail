// Shared types between main and renderer processes

export interface Slave {
  id: number;
  mac: string;
  rssi: number;
  state: SlaveState;
  paired: boolean;
}

export enum SlaveState {
  Unpaired = 0,
  Discovered = 1,
  Paired = 2,
  Lost = 3,
}

export interface Stats {
  paired: number;
  discovered: number;
  sent: number;
  received: number;
  lost: number;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  message?: string;
  data?: T;
  error?: string;
}

export interface LMSApi {
  getVersion: () => Promise<string>;
  connect: (port: string) => Promise<ApiResponse>;
  disconnect: () => Promise<ApiResponse>;
  getSlaves: () => Promise<{ slaves: Slave[]; count: number }>;
  pairSlave: (id: number) => Promise<ApiResponse>;
  unpairSlave: (id: number) => Promise<ApiResponse>;
  pingSlave: (id: number) => Promise<{ success: boolean; rtt_ms: number }>;
  sendCommand: (id: number, message: string) => Promise<ApiResponse>;
  broadcast: (message: string) => Promise<ApiResponse>;
  getStats: () => Promise<Stats>;
}

declare global {
  interface Window {
    lmsAPI: LMSApi;
  }
}

