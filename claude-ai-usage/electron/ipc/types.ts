// Type definitions for IPC communication

// ============================================
// Usage Data Types
// ============================================

export interface UsageData {
  sessionUsage: {
    used: number;
    limit: number;
    percentUsed: number;
    resetAt: string; // ISO timestamp
  };
  weeklyUsage: {
    used: number;
    limit: number;
    percentUsed: number;
    resetAt: string; // ISO timestamp
  };
  modelUsage?: {
    opus?: { used: number; limit: number; percentUsed: number };
    sonnet?: { used: number; limit: number; percentUsed: number };
  };
  subscriptionTier: 'free' | 'pro' | 'max5' | 'max20' | 'unknown';
  lastUpdated: string; // ISO timestamp
}

// ============================================
// Authentication Types
// ============================================

export interface AuthState {
  isAuthenticated: boolean;
  sessionExpiry?: string;
}

export interface AuthLoginResult {
  success: boolean;
  error?: string;
}

// ============================================
// Settings Types
// ============================================

export interface AlertThreshold {
  id: string;
  type: 'session' | 'weekly';
  percentage: number;
  enabled: boolean;
  soundEnabled: boolean;
}

export interface AppSettings {
  thresholds: AlertThreshold[];
  startMinimized: boolean;
  startWithWindows: boolean;
  theme: 'light' | 'dark' | 'system';
  pollIntervalMs: number;
}

// ============================================
// Notification Types
// ============================================

export interface NotificationPayload {
  title: string;
  body: string;
  type: 'info' | 'warning' | 'critical';
}

export interface ThresholdTriggeredPayload {
  threshold: AlertThreshold;
  currentPercent: number;
  usageType: 'session' | 'weekly';
}

// ============================================
// Store Schema (for electron-store)
// ============================================

export interface StoreSchema {
  auth: {
    sessionKey: string | null;
    sessionExpiry: string | null;
  };
  settings: AppSettings;
  apiConfig: {
    adminApiKey: string | null;
    organizationId: string | null;
  };
  cache: {
    lastUsage: UsageData | null;
    lastFetchTime: string | null;
  };
  windowState: {
    width: number;
    height: number;
    x: number | undefined;
    y: number | undefined;
    isMaximized: boolean;
  };
  notifications: {
    triggeredAlerts: string[];
    lastNotificationTimes: Record<string, string>;
    lastSessionResetAt: string | null;
    lastWeeklyResetAt: string | null;
  };
}

// ============================================
// Default Values
// ============================================

export const DEFAULT_THRESHOLDS: AlertThreshold[] = [
  { id: 'session-50', type: 'session', percentage: 50, enabled: true, soundEnabled: false },
  { id: 'session-75', type: 'session', percentage: 75, enabled: true, soundEnabled: true },
  { id: 'session-90', type: 'session', percentage: 90, enabled: true, soundEnabled: true },
  { id: 'weekly-50', type: 'weekly', percentage: 50, enabled: false, soundEnabled: false },
  { id: 'weekly-75', type: 'weekly', percentage: 75, enabled: true, soundEnabled: false },
  { id: 'weekly-90', type: 'weekly', percentage: 90, enabled: true, soundEnabled: true },
];

export const DEFAULT_SETTINGS: AppSettings = {
  thresholds: DEFAULT_THRESHOLDS,
  startMinimized: false,
  startWithWindows: false,
  theme: 'system',
  pollIntervalMs: 60000, // 1 minute
};

export const DEFAULT_WINDOW_STATE = {
  width: 400,
  height: 600,
  x: undefined,
  y: undefined,
  isMaximized: false,
};

export const DEFAULT_NOTIFICATIONS_STATE = {
  triggeredAlerts: [] as string[],
  lastNotificationTimes: {} as Record<string, string>,
  lastSessionResetAt: null as string | null,
  lastWeeklyResetAt: null as string | null,
};
