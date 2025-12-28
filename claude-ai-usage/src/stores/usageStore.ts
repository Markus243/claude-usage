import { create } from 'zustand';

// Re-export types for convenience
export interface UsageData {
  sessionUsage: {
    used: number;
    limit: number;
    percentUsed: number;
    resetAt: string;
  };
  weeklyUsage: {
    used: number;
    limit: number;
    percentUsed: number;
    resetAt: string;
  };
  modelUsage?: {
    opus?: { used: number; limit: number; percentUsed: number };
    sonnet?: { used: number; limit: number; percentUsed: number };
  };
  subscriptionTier: 'free' | 'pro' | 'max5' | 'max20' | 'unknown';
  lastUpdated: string;
}

interface UsageState {
  usage: UsageData | null;
  isLoading: boolean;
  isStale: boolean;
  error: string | null;
  lastUpdated: Date | null;

  // Actions
  setUsage: (usage: UsageData) => void;
  fetchUsage: () => Promise<void>;
  refresh: () => Promise<void>;
  setError: (error: string | null) => void;
  setStale: (stale: boolean) => void;
}

export const useUsageStore = create<UsageState>((set) => ({
  usage: null,
  isLoading: false, // Start as false
  isStale: false,
  error: null,
  lastUpdated: null,

  setUsage: (usage) =>
    set({
      usage,
      lastUpdated: new Date(),
      isStale: false,
      error: null,
    }),

  fetchUsage: async () => {
    if (!window.claudeUsage) {
      set({ error: 'App not initialized', isLoading: false });
      return;
    }
    set({ isLoading: true });
    try {
      const usage = await window.claudeUsage.usage.get();
      if (usage) {
        set({
          usage,
          lastUpdated: new Date(),
          isLoading: false,
          error: null,
        });
      } else {
        set({ isLoading: false });
      }
    } catch (error) {
      set({ error: String(error), isLoading: false });
    }
  },

  refresh: async () => {
    if (!window.claudeUsage) {
      set({ error: 'App not initialized', isLoading: false });
      return;
    }
    set({ isLoading: true });
    try {
      const usage = await window.claudeUsage.usage.refresh();
      if (usage) {
        set({
          usage,
          lastUpdated: new Date(),
          isLoading: false,
          isStale: false,
          error: null,
        });
      } else {
        set({ isLoading: false });
      }
    } catch (error) {
      set({ error: String(error), isLoading: false });
    }
  },

  setError: (error) => set({ error, isStale: true }),

  setStale: (stale) => set({ isStale: stale }),
}));

// Subscribe to usage updates from main process
if (typeof window !== 'undefined' && window.claudeUsage) {
  // Listen for preloaded data (sent immediately on app start)
  window.claudeUsage.usage.onPreloaded((usage) => {
    useUsageStore.getState().setUsage(usage);
  });

  // Listen for regular updates during polling
  window.claudeUsage.usage.onUpdated((usage) => {
    useUsageStore.getState().setUsage(usage);
  });

  window.claudeUsage.usage.onError((error) => {
    useUsageStore.getState().setError(error.error);
  });
}
