import { useEffect, useState } from 'react';
import { HashRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { useAuthStore } from './stores/authStore';
import { useUsageStore } from './stores/usageStore';
import { useSettingsStore } from './stores/settingsStore';
import { Dashboard } from './pages/Dashboard';
import { Settings } from './pages/Settings';
import { Login } from './pages/Login';
import './styles/globals.css';

function AppContent() {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading: authLoading, checkSession } = useAuthStore();
  const { fetchUsage } = useUsageStore();
  const { loadSettings, settings } = useSettingsStore();
  const [isInitialized, setIsInitialized] = useState(false);

  // Initialize app
  useEffect(() => {
    const init = async () => {
      await loadSettings();
      const authenticated = await checkSession();
      if (authenticated) {
        await fetchUsage();
      }
      setIsInitialized(true);
    };
    init();
  }, []);

  // Apply theme based on settings
  useEffect(() => {
    if (!settings) return;

    const applyTheme = (theme: 'light' | 'dark') => {
      document.documentElement.setAttribute('data-theme', theme);
    };

    if (settings.theme === 'system') {
      // Check system preference
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      applyTheme(mediaQuery.matches ? 'dark' : 'light');

      // Listen for system theme changes
      const handler = (e: MediaQueryListEvent) => {
        applyTheme(e.matches ? 'dark' : 'light');
      };
      mediaQuery.addEventListener('change', handler);
      return () => mediaQuery.removeEventListener('change', handler);
    } else {
      applyTheme(settings.theme);
    }
  }, [settings?.theme]);

  // Listen for navigation events from main process
  useEffect(() => {
    if (!window.claudeUsage) return;

    const cleanup = window.claudeUsage.navigation.onNavigate((path) => {
      navigate(path);
    });

    return cleanup;
  }, [navigate]);

  // Show loading state while initializing
  if (!isInitialized || authLoading) {
    return (
      <div className="app-loading">
        <div className="loading-spinner" />
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <Routes>
      <Route
        path="/"
        element={isAuthenticated ? <Dashboard /> : <Navigate to="/login" replace />}
      />
      <Route
        path="/login"
        element={!isAuthenticated ? <Login /> : <Navigate to="/" replace />}
      />
      <Route
        path="/settings"
        element={isAuthenticated ? <Settings /> : <Navigate to="/login" replace />}
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <HashRouter>
      <div className="app">
        <AppContent />
      </div>
    </HashRouter>
  );
}

export default App;
