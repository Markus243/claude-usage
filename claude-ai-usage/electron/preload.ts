const { ipcRenderer, contextBridge } = require('electron');
import { IPC_CHANNELS } from './ipc/channels';
import type {
  UsageData,
  AuthState,
  AuthLoginResult,
  AppSettings,
  ThresholdTriggeredPayload,
} from './ipc/types';

// ============================================
// Type definitions for exposed API
// ============================================

export interface ClaudeUsageAPI {
  // Authentication
  auth: {
    login: () => Promise<AuthLoginResult>;
    logout: () => Promise<{ success: boolean }>;
    checkSession: () => Promise<AuthState>;
    onStatusChanged: (callback: (state: AuthState) => void) => () => void;
  };

  // Usage data
  usage: {
    get: () => Promise<UsageData | null>;
    refresh: () => Promise<UsageData | null>;
    onUpdated: (callback: (usage: UsageData) => void) => () => void;
    onError: (callback: (error: { error: string }) => void) => () => void;
  };

  // Settings
  settings: {
    getAll: () => Promise<AppSettings>;
    get: <K extends keyof AppSettings>(key: K) => Promise<AppSettings[K]>;
    set: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => Promise<{ success: boolean }>;
  };

  // Notifications
  notifications: {
    onThresholdTriggered: (callback: (payload: ThresholdTriggeredPayload) => void) => () => void;
  };

  // Window
  window: {
    show: () => Promise<void>;
    hide: () => Promise<void>;
    minimizeToTray: () => Promise<void>;
  };

  // App
  app: {
    openExternal: (url: string) => Promise<{ success: boolean; error?: string }>;
  };

  // Navigation (for internal routing)
  navigation: {
    onNavigate: (callback: (path: string) => void) => () => void;
  };
}

// ============================================
// Helper to create event listener with cleanup
// ============================================

function createEventListener<T>(channel: string, callback: (data: T) => void): () => void {
  const handler = (_event: Electron.IpcRendererEvent, data: T) => callback(data);
  ipcRenderer.on(channel, handler);

  // Return cleanup function
  return () => {
    ipcRenderer.removeListener(channel, handler);
  };
}

// ============================================
// Expose API to renderer
// ============================================

const api: ClaudeUsageAPI = {
  // Authentication API
  auth: {
    login: () => ipcRenderer.invoke(IPC_CHANNELS.AUTH_LOGIN),
    logout: () => ipcRenderer.invoke(IPC_CHANNELS.AUTH_LOGOUT),
    checkSession: () => ipcRenderer.invoke(IPC_CHANNELS.AUTH_CHECK_SESSION),
    onStatusChanged: (callback) =>
      createEventListener(IPC_CHANNELS.AUTH_STATUS_CHANGED, callback),
  },

  // Usage data API
  usage: {
    get: () => ipcRenderer.invoke(IPC_CHANNELS.USAGE_GET),
    refresh: () => ipcRenderer.invoke(IPC_CHANNELS.USAGE_REFRESH),
    onUpdated: (callback) => createEventListener(IPC_CHANNELS.USAGE_UPDATED, callback),
    onError: (callback) => createEventListener(IPC_CHANNELS.USAGE_ERROR, callback),
  },

  // Settings API
  settings: {
    getAll: () => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET_ALL),
    get: (key) => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET, key),
    set: (key, value) => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SET, key, value),
  },

  // Notifications API
  notifications: {
    onThresholdTriggered: (callback) =>
      createEventListener(IPC_CHANNELS.NOTIFICATION_THRESHOLD_TRIGGERED, callback),
  },

  // Window API
  window: {
    show: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_SHOW),
    hide: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_HIDE),
    minimizeToTray: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_MINIMIZE_TO_TRAY),
  },

  // App API
  app: {
    openExternal: (url) => ipcRenderer.invoke(IPC_CHANNELS.APP_OPEN_EXTERNAL, url),
  },

  // Navigation API (for routing from main process)
  navigation: {
    onNavigate: (callback) => createEventListener('navigate', callback),
  },
};

// Expose the typed API to the renderer process
contextBridge.exposeInMainWorld('claudeUsage', api);

// Also expose ipcRenderer for backwards compatibility (if needed)
contextBridge.exposeInMainWorld('electronIpc', {
  on: (channel: string, listener: (...args: any[]) => void) => {
    ipcRenderer.on(channel, (_event: Electron.IpcRendererEvent, ...args: any[]) => listener(...args));
  },
  off: (channel: string, listener: (...args: any[]) => void) => {
    ipcRenderer.removeListener(channel, listener);
  },
  send: (channel: string, ...args: any[]) => {
    ipcRenderer.send(channel, ...args);
  },
  invoke: (channel: string, ...args: any[]) => {
    return ipcRenderer.invoke(channel, ...args);
  },
});

// ============================================
// Type declaration for window object
// ============================================

declare global {
  interface Window {
    claudeUsage: ClaudeUsageAPI;
    electronIpc: {
      on: (channel: string, listener: (...args: any[]) => void) => void;
      off: (channel: string, listener: (...args: any[]) => void) => void;
      send: (channel: string, ...args: any[]) => void;
      invoke: (channel: string, ...args: any[]) => Promise<any>;
    };
  }
}
