import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';

class Application {
  private mainWindow: BrowserWindow | null = null;

  constructor() {
    this.setupApp();
  }

  private setupApp(): void {
    app.whenReady().then(() => this.onReady());
    app.on('window-all-closed', () => this.onWindowAllClosed());
    app.on('activate', () => this.onActivate());
  }

  private onReady(): void {
    this.createWindow();
    this.setupIPC();
  }

  private createWindow(): void {
    this.mainWindow = new BrowserWindow({
      width: 1400,
      height: 900,
      minWidth: 1200,
      minHeight: 700,
      backgroundColor: '#1e1e1e',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, '../preload/index.js'),
      },
      titleBarStyle: 'default',
      show: false,
    });

    // Load the app
    if (process.env.NODE_ENV === 'development') {
      this.mainWindow.loadURL('http://localhost:9000');
      this.mainWindow.webContents.openDevTools();
    } else {
      this.mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
    }

    // Show window when ready
    this.mainWindow.once('ready-to-show', () => {
      this.mainWindow?.show();
    });

    this.mainWindow.on('closed', () => {
      this.mainWindow = null;
    });
  }

  private setupIPC(): void {
    // System info
    ipcMain.handle('app:getVersion', () => {
      return app.getVersion();
    });

    ipcMain.handle('app:getInfo', () => {
      return {
        version: app.getVersion(),
        name: 'Lumirail Studio',
        model: 'LMS-S1-G2', // Current connected model
      };
    });

    // API placeholder handlers (will be implemented later)
    ipcMain.handle('api:connect', async (_event, port: string) => {
      console.log(`[IPC] Connect requested: ${port}`);
      // TODO: Implement with API Bridge
      return { success: true, message: `Mock: Connected to ${port}` };
    });

    ipcMain.handle('api:disconnect', async () => {
      console.log('[IPC] Disconnect requested');
      return { success: true };
    });

    ipcMain.handle('api:getSlaves', async () => {
      console.log('[IPC] Get slaves requested');
      // Mock data for now
      return {
        slaves: [
          {
            id: 0,
            mac: 'FC:B4:67:4E:4A:40',
            rssi: -45,
            state: 1,
            paired: false,
          },
          {
            id: 1,
            mac: '34:94:54:5D:8D:04',
            rssi: -52,
            state: 2,
            paired: true,
          },
        ],
        count: 2,
      };
    });

    ipcMain.handle('api:pairSlave', async (_event, id: number) => {
      console.log(`[IPC] Pair slave ${id}`);
      return { success: true, message: `Slave ${id} paired` };
    });

    ipcMain.handle('api:unpairSlave', async (_event, id: number) => {
      console.log(`[IPC] Unpair slave ${id}`);
      return { success: true, message: `Slave ${id} unpaired` };
    });

    ipcMain.handle('api:pingSlave', async (_event, id: number) => {
      console.log(`[IPC] Ping slave ${id}`);
      return { success: true, rtt_ms: Math.floor(Math.random() * 50) + 5 };
    });

    ipcMain.handle('api:sendCommand', async (_event, id: number, message: string) => {
      console.log(`[IPC] Send command to ${id}: ${message}`);
      return { success: true };
    });

    ipcMain.handle('api:broadcast', async (_event, message: string) => {
      console.log(`[IPC] Broadcast: ${message}`);
      return { success: true };
    });

    ipcMain.handle('api:getStats', async () => {
      console.log('[IPC] Get stats');
      return {
        paired: 1,
        discovered: 2,
        sent: 42,
        received: 40,
        lost: 2,
      };
    });
  }

  private onWindowAllClosed(): void {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  }

  private onActivate(): void {
    if (this.mainWindow === null) {
      this.createWindow();
    }
  }
}

// Start the application
new Application();

