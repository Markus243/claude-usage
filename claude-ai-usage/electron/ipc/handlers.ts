const { ipcMain, shell } = require('electron');
import type { BrowserWindow } from 'electron';
import { IPC_CHANNELS } from './channels';
import { getAuthService } from '../services/AuthService';
import { getUsageService } from '../services/UsageService';
import { getNotificationService } from '../services/NotificationService';
import { getStore } from '../storage/SecureStore';
import { getTrayManager } from '../tray/TrayManager';
import { AppSettings } from './types';

/**
 * Register all IPC handlers
 */
export function registerIPCHandlers(mainWindow: BrowserWindow): void {
  const authService = getAuthService();
  const usageService = getUsageService();
  const notificationService = getNotificationService();
  const store = getStore();
  const trayManager = getTrayManager();

  // ============================================
  // Authentication Handlers
  // ============================================

  ipcMain.handle(IPC_CHANNELS.AUTH_LOGIN, async () => {
    const result = await authService.login();
    if (result.success) {
      trayManager.setAuthState(true);
      // Immediately fetch usage data and send to renderer
      const usage = await usageService.fetchUsage();
      if (usage) {
        mainWindow.webContents.send('usage:preloaded', usage);
        trayManager.updateUsage(usage);
      }
      // Start polling for subsequent updates
      usageService.startPolling();
    }
    return result;
  });

  ipcMain.handle(IPC_CHANNELS.AUTH_LOGOUT, async () => {
    await authService.logout();
    usageService.stopPolling();
    trayManager.setAuthState(false);
    notificationService.clearAllAlerts();
    return { success: true };
  });

  ipcMain.handle(IPC_CHANNELS.AUTH_CHECK_SESSION, async () => {
    const isValid = await authService.checkSession();
    return { isAuthenticated: isValid };
  });

  // ============================================
  // Usage Data Handlers
  // ============================================

  ipcMain.handle(IPC_CHANNELS.USAGE_GET, async () => {
    const usage = usageService.getLastUsage();
    return usage;
  });

  ipcMain.handle(IPC_CHANNELS.USAGE_REFRESH, async () => {
    const usage = await usageService.refresh();
    return usage;
  });

  // ============================================
  // Settings Handlers
  // ============================================

  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET_ALL, async () => {
    return store.getSettings();
  });

  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, async (_event: Electron.IpcMainInvokeEvent, key: keyof AppSettings) => {
    return store.getSetting(key);
  });

  ipcMain.handle(IPC_CHANNELS.SETTINGS_SET, async (_event: Electron.IpcMainInvokeEvent, key: keyof AppSettings, value: any) => {
    store.updateSetting(key, value);
    return { success: true };
  });

  // ============================================
  // Window Management Handlers
  // ============================================

  ipcMain.handle(IPC_CHANNELS.WINDOW_SHOW, () => {
    mainWindow.show();
    mainWindow.focus();
  });

  ipcMain.handle(IPC_CHANNELS.WINDOW_HIDE, () => {
    mainWindow.hide();
  });

  ipcMain.handle(IPC_CHANNELS.WINDOW_MINIMIZE_TO_TRAY, () => {
    mainWindow.hide();
  });

  // ============================================
  // App Handlers
  // ============================================

  ipcMain.handle(IPC_CHANNELS.APP_OPEN_EXTERNAL, async (_event: Electron.IpcMainInvokeEvent, url: string) => {
    // Validate URL to prevent potential security issues
    if (url.startsWith('https://') || url.startsWith('http://')) {
      await shell.openExternal(url);
      return { success: true };
    }
    return { success: false, error: 'Invalid URL' };
  });

  // ============================================
  // Service Event Forwarding
  // ============================================

  // Forward usage updates to renderer
  usageService.on('usage:updated', (usage) => {
    mainWindow.webContents.send(IPC_CHANNELS.USAGE_UPDATED, usage);
    trayManager.updateUsage(usage);
    notificationService.checkThresholds(usage);
  });

  usageService.on('usage:error', (error) => {
    mainWindow.webContents.send(IPC_CHANNELS.USAGE_ERROR, error);
    trayManager.setOfflineState();
  });

  // Forward auth events to renderer
  authService.on('auth:success', () => {
    mainWindow.webContents.send(IPC_CHANNELS.AUTH_STATUS_CHANGED, { isAuthenticated: true });
  });

  authService.on('auth:logout', () => {
    mainWindow.webContents.send(IPC_CHANNELS.AUTH_STATUS_CHANGED, { isAuthenticated: false });
  });

  authService.on('auth:expired', () => {
    mainWindow.webContents.send(IPC_CHANNELS.AUTH_STATUS_CHANGED, { isAuthenticated: false });
    trayManager.setAuthState(false);
  });

  // Forward notification events
  notificationService.on('threshold:triggered', (payload) => {
    mainWindow.webContents.send(IPC_CHANNELS.NOTIFICATION_THRESHOLD_TRIGGERED, payload);
  });

  notificationService.on('notification:clicked', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  // Handle tray events
  trayManager.on('refresh', () => {
    usageService.refresh();
  });

  trayManager.on('login', async () => {
    const result = await authService.login();
    if (result.success) {
      trayManager.setAuthState(true);
      // Immediately fetch usage data
      const usage = await usageService.fetchUsage();
      if (usage) {
        mainWindow.webContents.send('usage:preloaded', usage);
        trayManager.updateUsage(usage);
      }
      usageService.startPolling();
    }
  });

  trayManager.on('logout', async () => {
    await authService.logout();
    usageService.stopPolling();
    trayManager.setAuthState(false);
    notificationService.clearAllAlerts();
  });

  trayManager.on('show-settings', () => {
    mainWindow.webContents.send('navigate', '/settings');
  });
}

/**
 * Clean up IPC handlers
 */
export function cleanupIPCHandlers(): void {
  Object.values(IPC_CHANNELS).forEach((channel) => {
    ipcMain.removeHandler(channel);
  });
}
