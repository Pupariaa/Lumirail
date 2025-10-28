import { create } from 'zustand';
import { Slave, Stats } from '../../shared/types';

interface AppState {
  // Connection
  connected: boolean;
  port: string;
  setConnected: (connected: boolean) => void;
  setPort: (port: string) => void;

  // Slaves
  slaves: Slave[];
  setSlaves: (slaves: Slave[]) => void;

  // Stats
  stats: Stats | null;
  setStats: (stats: Stats) => void;

  // UI State
  selectedSlaveId: number | null;
  setSelectedSlaveId: (id: number | null) => void;

  // Logs
  logs: LogEntry[];
  addLog: (level: LogLevel, message: string) => void;
  clearLogs: () => void;
}

export enum LogLevel {
  Info = 'info',
  Success = 'success',
  Warning = 'warning',
  Error = 'error',
}

export interface LogEntry {
  id: string;
  timestamp: Date;
  level: LogLevel;
  message: string;
}

export const useAppStore = create<AppState>((set) => ({
  // Connection
  connected: false,
  port: 'COM3',
  setConnected: (connected) => set({ connected }),
  setPort: (port) => set({ port }),

  // Slaves
  slaves: [],
  setSlaves: (slaves) => set({ slaves }),

  // Stats
  stats: null,
  setStats: (stats) => set({ stats }),

  // UI State
  selectedSlaveId: null,
  setSelectedSlaveId: (id) => set({ selectedSlaveId: id }),

  // Logs
  logs: [],
  addLog: (level, message) =>
    set((state) => ({
      logs: [
        ...state.logs,
        {
          id: `${Date.now()}-${Math.random()}`,
          timestamp: new Date(),
          level,
          message,
        },
      ].slice(-100), // Keep last 100 logs
    })),
  clearLogs: () => set({ logs: [] }),
}));

