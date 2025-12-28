// IPC Channel constants for type-safe communication between main and renderer processes

export const IPC_CHANNELS = {
  // Authentication
  AUTH_LOGIN: 'auth:login',
  AUTH_LOGOUT: 'auth:logout',
  AUTH_CHECK_SESSION: 'auth:check-session',
  AUTH_STATUS_CHANGED: 'auth:status-changed',

  // Usage data
  USAGE_GET: 'usage:get',
  USAGE_REFRESH: 'usage:refresh',
  USAGE_UPDATED: 'usage:updated',
  USAGE_ERROR: 'usage:error',

  // Settings
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',
  SETTINGS_GET_ALL: 'settings:get-all',

  // Notifications
  NOTIFICATION_SHOW: 'notification:show',
  NOTIFICATION_THRESHOLD_TRIGGERED: 'notification:threshold-triggered',

  // Window management
  WINDOW_SHOW: 'window:show',
  WINDOW_HIDE: 'window:hide',
  WINDOW_MINIMIZE_TO_TRAY: 'window:minimize-to-tray',

  // App
  APP_QUIT: 'app:quit',
  APP_OPEN_EXTERNAL: 'app:open-external',
} as const;

export type IPCChannel = typeof IPC_CHANNELS[keyof typeof IPC_CHANNELS];
