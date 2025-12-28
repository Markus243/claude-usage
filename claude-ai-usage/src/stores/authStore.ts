import { create } from 'zustand';

interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  // Actions
  setAuthenticated: (authenticated: boolean) => void;
  login: () => Promise<boolean>;
  logout: () => Promise<void>;
  checkSession: () => Promise<boolean>;
  setError: (error: string | null) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  isAuthenticated: false,
  isLoading: false, // Start as false, will be set when checking
  error: null,

  setAuthenticated: (authenticated) => set({ isAuthenticated: authenticated }),

  login: async () => {
    if (!window.claudeUsage) {
      set({ error: 'App not initialized', isLoading: false });
      return false;
    }
    set({ isLoading: true, error: null });
    try {
      const result = await window.claudeUsage.auth.login();
      if (result.success) {
        set({ isAuthenticated: true, isLoading: false });
        return true;
      } else {
        set({ error: result.error || 'Login failed', isLoading: false });
        return false;
      }
    } catch (error) {
      set({ error: String(error), isLoading: false });
      return false;
    }
  },

  logout: async () => {
    if (!window.claudeUsage) return;
    set({ isLoading: true });
    try {
      await window.claudeUsage.auth.logout();
      set({ isAuthenticated: false, isLoading: false });
    } catch (error) {
      set({ error: String(error), isLoading: false });
    }
  },

  checkSession: async () => {
    if (!window.claudeUsage) {
      set({ isAuthenticated: false, isLoading: false });
      return false;
    }
    set({ isLoading: true });
    try {
      const result = await window.claudeUsage.auth.checkSession();
      set({ isAuthenticated: result.isAuthenticated, isLoading: false });
      return result.isAuthenticated;
    } catch (error) {
      set({ isAuthenticated: false, isLoading: false });
      return false;
    }
  },

  setError: (error) => set({ error }),
}));

// Subscribe to auth status changes from main process
if (typeof window !== 'undefined' && window.claudeUsage) {
  window.claudeUsage.auth.onStatusChanged((state) => {
    useAuthStore.getState().setAuthenticated(state.isAuthenticated);
  });
}
