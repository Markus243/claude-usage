const Store = require('electron-store');
const { safeStorage } = require('electron');
import {
  StoreSchema,
  DEFAULT_SETTINGS,
  DEFAULT_WINDOW_STATE,
  DEFAULT_NOTIFICATIONS_STATE,
  AppSettings,
  UsageData,
} from '../ipc/types';

// Define the store type - electron-store supports dot notation for nested access
type ElectronStore = {
  get: (key: string) => any;
  set: (key: string, value: any) => void;
  clear: () => void;
  path: string;
};

// electron-store with type safety
class SecureStore {
  private store: ElectronStore;

  constructor() {
    this.store = new Store({
      name: 'claude-usage-tracker',
      defaults: {
        auth: {
          sessionKey: null,
          sessionExpiry: null,
        },
        settings: DEFAULT_SETTINGS,
        apiConfig: {
          adminApiKey: null,
          organizationId: null,
        },
        cache: {
          lastUsage: null,
          lastFetchTime: null,
        },
        windowState: DEFAULT_WINDOW_STATE,
        notifications: DEFAULT_NOTIFICATIONS_STATE,
      },
    });
  }

  // ============================================
  // Secure Value Methods (for sensitive data)
  // ============================================

  private encryptValue(value: string): string {
    if (safeStorage.isEncryptionAvailable()) {
      const encrypted = safeStorage.encryptString(value);
      return encrypted.toString('base64');
    }
    // Fallback to plain storage if encryption unavailable
    return value;
  }

  private decryptValue(value: string): string {
    if (safeStorage.isEncryptionAvailable()) {
      try {
        const buffer = Buffer.from(value, 'base64');
        return safeStorage.decryptString(buffer);
      } catch {
        // If decryption fails, assume it's plain text (migration case)
        return value;
      }
    }
    return value;
  }

  // ============================================
  // Authentication
  // ============================================

  setSessionKey(key: string): void {
    const encrypted = this.encryptValue(key);
    this.store.set('auth.sessionKey', encrypted);
  }

  getSessionKey(): string | null {
    const encrypted = this.store.get('auth.sessionKey');
    if (!encrypted) return null;
    return this.decryptValue(encrypted);
  }

  setSessionExpiry(expiry: string | null): void {
    this.store.set('auth.sessionExpiry', expiry);
  }

  getSessionExpiry(): string | null {
    return this.store.get('auth.sessionExpiry');
  }

  clearAuth(): void {
    this.store.set('auth.sessionKey', null);
    this.store.set('auth.sessionExpiry', null);
  }

  // ============================================
  // Settings
  // ============================================

  getSettings(): AppSettings {
    return this.store.get('settings');
  }

  setSettings(settings: AppSettings): void {
    this.store.set('settings', settings);
  }

  updateSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]): void {
    this.store.set(`settings.${key}`, value);
  }

  getSetting<K extends keyof AppSettings>(key: K): AppSettings[K] {
    return this.store.get(`settings.${key}`);
  }

  // ============================================
  // API Config (for bonus Admin API feature)
  // ============================================

  setAdminApiKey(key: string): void {
    const encrypted = this.encryptValue(key);
    this.store.set('apiConfig.adminApiKey', encrypted);
  }

  getAdminApiKey(): string | null {
    const encrypted = this.store.get('apiConfig.adminApiKey');
    if (!encrypted) return null;
    return this.decryptValue(encrypted);
  }

  setOrganizationId(orgId: string | null): void {
    this.store.set('apiConfig.organizationId', orgId);
  }

  getOrganizationId(): string | null {
    return this.store.get('apiConfig.organizationId');
  }

  // ============================================
  // Cache
  // ============================================

  setCachedUsage(usage: UsageData): void {
    this.store.set('cache.lastUsage', usage);
    this.store.set('cache.lastFetchTime', new Date().toISOString());
  }

  getCachedUsage(): UsageData | null {
    return this.store.get('cache.lastUsage');
  }

  getLastFetchTime(): string | null {
    return this.store.get('cache.lastFetchTime');
  }

  // ============================================
  // Window State
  // ============================================

  getWindowState() {
    return this.store.get('windowState');
  }

  setWindowState(state: Partial<StoreSchema['windowState']>): void {
    const current = this.getWindowState();
    this.store.set('windowState', { ...current, ...state });
  }

  // ============================================
  // Notifications State
  // ============================================

  getNotificationsState(): StoreSchema['notifications'] {
    return this.store.get('notifications') || DEFAULT_NOTIFICATIONS_STATE;
  }

  setTriggeredAlerts(alerts: string[]): void {
    this.store.set('notifications.triggeredAlerts', alerts);
  }

  getTriggeredAlerts(): string[] {
    return this.store.get('notifications.triggeredAlerts') || [];
  }

  setLastNotificationTime(alertKey: string, time: string): void {
    const times = this.store.get('notifications.lastNotificationTimes') || {};
    times[alertKey] = time;
    this.store.set('notifications.lastNotificationTimes', times);
  }

  getLastNotificationTime(alertKey: string): string | null {
    const times = this.store.get('notifications.lastNotificationTimes') || {};
    return times[alertKey] || null;
  }

  setLastResetTimestamps(sessionResetAt: string | null, weeklyResetAt: string | null): void {
    this.store.set('notifications.lastSessionResetAt', sessionResetAt);
    this.store.set('notifications.lastWeeklyResetAt', weeklyResetAt);
  }

  getLastResetTimestamps(): { sessionResetAt: string | null; weeklyResetAt: string | null } {
    return {
      sessionResetAt: this.store.get('notifications.lastSessionResetAt'),
      weeklyResetAt: this.store.get('notifications.lastWeeklyResetAt'),
    };
  }

  clearNotificationsForType(type: 'session' | 'weekly'): void {
    const alerts = this.getTriggeredAlerts();
    const filteredAlerts = alerts.filter(key => !key.startsWith(type));
    this.setTriggeredAlerts(filteredAlerts);
  }

  // ============================================
  // Utility
  // ============================================

  clear(): void {
    this.store.clear();
  }

  getStorePath(): string {
    return this.store.path;
  }
}

// Singleton instance
let storeInstance: SecureStore | null = null;

export function getStore(): SecureStore {
  if (!storeInstance) {
    storeInstance = new SecureStore();
  }
  return storeInstance;
}

export { SecureStore };
