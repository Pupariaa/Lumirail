export enum Timebase {
  Simulation = 'sim',
  Real = 'real',
}

export enum BlendMode {
  Overwrite = 'overwrite',
  Max = 'max',
  Add = 'add',
  Multiply = 'multiply',
}

export type LEDId = number;
export type LEDFrame = Uint8Array;
export type TimelineTime = number;
export type SimulationTime = number;

export const SIMULATION_CYCLE_HOURS = 24;

export interface TimeRange {
  start: TimelineTime;
  end: TimelineTime;
}

export interface Target {
  type: 'group' | 'module' | 'ledRange' | 'singleLed';
  id?: string;
  ledStart?: LEDId;
  ledEnd?: LEDId;
  ledId?: LEDId;
}

export interface Modulation {
  type: 'offset' | 'noise' | 'mask';
  amount: number;
  frequency?: number;
  seed?: number;
}

export interface Intention {
  id: string;
  priority: number;
  blendMode: BlendMode;
  target: Target;
  modulations?: Modulation[];
  enabled: boolean;
}

export interface Clip {
  id: string;
  name: string;
  presetId: string;
  presetParams: Record<string, number>;
  timeRange: TimeRange;
  target: Target;
  priority: number;
  blendMode: BlendMode;
  enabled: boolean;
  randomSeed?: number;
}

export interface Timeline {
  clips: Clip[];
  duration: TimelineTime;
  playhead: TimelineTime;
  playing: boolean;
}

export interface PresetParameter {
  id: string;
  label: string;
  type: 'number' | 'slider' | 'boolean';
  min?: number;
  max?: number;
  defaultValue: number | boolean;
  step?: number;
}

export interface InfrastructurePreset {
  id: string;
  name: string;
  description: string;
  category: string;
  parameters: PresetParameter[];
  zones: string[];
  generate: (
    params: Record<string, number | boolean>,
    seed: number
  ) => Intention[];
}

export interface IntentionResult {
  ledId: LEDId;
  value: number;
  priority: number;
  blendMode: BlendMode;
}

export interface ResolvedFrame {
  timestamp: TimelineTime;
  simulationTime: SimulationTime;
  ledFrame: LEDFrame;
}

