// Electron main process entry point
// Must use require for electron in CJS context
const { app, BrowserWindow, Menu } = require('electron');
const path = require('node:path');

import { registerIPCHandlers, cleanupIPCHandlers } from './ipc/handlers';
import { getTrayManager } from './tray/TrayManager';
import { getAuthService } from './services/AuthService';
import { getUsageService } from './services/UsageService';
import { getStore } from './storage/SecureStore';

// The built directory structure
const __dirname_resolved = __dirname;
process.env.APP_ROOT = path.join(__dirname_resolved, '..');

export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL'];
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron');
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist');

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, 'public')
  : RENDERER_DIST;

let mainWindow: typeof BrowserWindow | null = null;

function createWindow() {
  const store = getStore();
  const windowState = store.getWindowState();
  const settings = store.getSettings();

  mainWindow = new BrowserWindow({
    width: windowState.width,
    height: windowState.height,
    x: windowState.x,
    y: windowState.y,
    minWidth: 350,
    minHeight: 500,
    icon: path.join(process.env.VITE_PUBLIC!, 'LOGO.png'),
    title: 'Claude Usage Tracker',
    frame: true,
    autoHideMenuBar: true, // Hide menu bar but allow access with Alt
    show: !settings.startMinimized, // Don't show if starting minimized
    webPreferences: {
      preload: path.join(__dirname_resolved, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  // Remove the default menu completely
  Menu.setApplicationMenu(null);

  // Save window state on close/move/resize
  mainWindow.on('close', (event: Event) => {
    // Minimize to tray instead of closing
    if (mainWindow && !(app as any).isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      return;
    }

    // Save window state before closing
    if (mainWindow) {
      const bounds = mainWindow.getBounds();
      store.setWindowState({
        width: bounds.width,
        height: bounds.height,
        x: bounds.x,
        y: bounds.y,
        isMaximized: mainWindow.isMaximized(),
      });
    }
  });

  mainWindow.on('resize', () => {
    if (mainWindow && !mainWindow.isMaximized()) {
      const bounds = mainWindow.getBounds();
      store.setWindowState({ width: bounds.width, height: bounds.height });
    }
  });

  mainWindow.on('move', () => {
    if (mainWindow && !mainWindow.isMaximized()) {
      const bounds = mainWindow.getBounds();
      store.setWindowState({ x: bounds.x, y: bounds.y });
    }
  });

  // Initialize system tray
  const trayManager = getTrayManager();
  trayManager.initialize(mainWindow);

  // Register IPC handlers
  registerIPCHandlers(mainWindow);

  // Load the app
  if (VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(RENDERER_DIST, 'index.html'));
  }

  // Initialize services after window is ready
  mainWindow.webContents.on('did-finish-load', async () => {
    await initializeServices(mainWindow);
  });
}

async function initializeServices(window: typeof BrowserWindow) {
  const authService = getAuthService();
  const usageService = getUsageService();
  const trayManager = getTrayManager();

  // Initialize tray
  try {
    trayManager.initialize(window);
  } catch (err) {
    console.error('Failed to initialize tray:', err);
  }

  // Check if user has valid session
  const isAuthenticated = await authService.checkSession();

  if (isAuthenticated) {
    trayManager.setAuthState(true);

    // Preload usage data immediately - fetch and send to renderer before starting polling
    const usage = await usageService.fetchUsage();
    if (usage && window.webContents) {
      // Send preloaded data to renderer immediately
      window.webContents.send('usage:preloaded', usage);
    }

    // Start polling for subsequent updates
    usageService.startPolling();
  } else {
    trayManager.setAuthState(false);
  }
}

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    // Focus the main window if user tries to open another instance
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  // Handle app ready
  app.whenReady().then(() => {
    createWindow();
  });

  // Mark app as quitting when quit is triggered
  app.on('before-quit', () => {
    (app as any).isQuitting = true;
  });

  // Quit when all windows are closed (except on macOS)
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      // Clean up
      const trayManager = getTrayManager();
      trayManager.destroy();

      const usageService = getUsageService();
      usageService.stopPolling();

      cleanupIPCHandlers();

      app.quit();
    }
  });

  app.on('activate', () => {
    // On macOS re-create window when dock icon is clicked
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else if (mainWindow) {
      mainWindow.show();
    }
  });

  // Handle certificate errors (for development)
  app.on('certificate-error', (event: Event, _webContents: any, _url: string, _error: any, _certificate: any, callback: Function) => {
    // In development, ignore certificate errors
    if (VITE_DEV_SERVER_URL) {
      event.preventDefault();
      callback(true);
    } else {
      callback(false);
    }
  });
}
