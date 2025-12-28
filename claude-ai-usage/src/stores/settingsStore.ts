import { create } from 'zustand';

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

interface SettingsState {
  settings: AppSettings | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  loadSettings: () => Promise<void>;
  updateThresholds: (thresholds: AlertThreshold[]) => Promise<void>;
  updateSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => Promise<void>;
  setError: (error: string | null) => void;
}

const DEFAULT_SETTINGS: AppSettings = {
  thresholds: [
    { id: 'session-50', type: 'session', percentage: 50, enabled: true, soundEnabled: false },
    { id: 'session-75', type: 'session', percentage: 75, enabled: true, soundEnabled: true },
    { id: 'session-90', type: 'session', percentage: 90, enabled: true, soundEnabled: true },
    { id: 'weekly-50', type: 'weekly', percentage: 50, enabled: false, soundEnabled: false },
    { id: 'weekly-75', type: 'weekly', percentage: 75, enabled: true, soundEnabled: false },
    { id: 'weekly-90', type: 'weekly', percentage: 90, enabled: true, soundEnabled: true },
  ],
  startMinimized: false,
  startWithWindows: false,
  theme: 'system',
  pollIntervalMs: 60000,
};

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: null,
  isLoading: false, // Start as false
  error: null,

  loadSettings: async () => {
    if (!window.claudeUsage) {
      // Use defaults if not in electron
      set({ settings: DEFAULT_SETTINGS, isLoading: false });
      return;
    }
    set({ isLoading: true });
    try {
      const settings = await window.claudeUsage.settings.getAll();
      set({ settings, isLoading: false });
    } catch (error) {
      // Use defaults if loading fails
      set({ settings: DEFAULT_SETTINGS, isLoading: false, error: String(error) });
    }
  },

  updateThresholds: async (thresholds) => {
    const current = get().settings;
    if (!current || !window.claudeUsage) return;

    try {
      await window.claudeUsage.settings.set('thresholds', thresholds);
      set({ settings: { ...current, thresholds } });
    } catch (error) {
      set({ error: String(error) });
    }
  },

  updateSetting: async (key, value) => {
    const current = get().settings;
    if (!current || !window.claudeUsage) return;

    try {
      await window.claudeUsage.settings.set(key, value);
      set({ settings: { ...current, [key]: value } });
    } catch (error) {
      set({ error: String(error) });
    }
  },

  setError: (error) => set({ error }),
}));
