export interface LumirailNode {
  id: string;
  name: string;
  connected: boolean;
  modules: LMS_S1_G2[];
}

export interface LMS_S1_G2 {
  id: string;
  moduleIndex: number;
  channelCount: number;
  ledStartIndex: number;
  connected: boolean;
}

export const MODULE_CHANNEL_COUNT = 32;
export const DEFAULT_MODULE_COUNT = 2;

