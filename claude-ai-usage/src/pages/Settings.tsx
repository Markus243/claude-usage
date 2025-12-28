import { useNavigate } from 'react-router-dom';
import { useSettingsStore, AlertThreshold } from '../stores/settingsStore';
import './Settings.css';

export function Settings() {
  const navigate = useNavigate();
  const { settings, updateThresholds, updateSetting } = useSettingsStore();

  if (!settings) {
    return <div className="settings-loading">Loading settings...</div>;
  }

  const handleBack = () => {
    navigate('/');
  };

  const handleThresholdToggle = (id: string) => {
    const updated = settings.thresholds.map((t) =>
      t.id === id ? { ...t, enabled: !t.enabled } : t
    );
    updateThresholds(updated);
  };

  const handleSoundToggle = (id: string) => {
    const updated = settings.thresholds.map((t) =>
      t.id === id ? { ...t, soundEnabled: !t.soundEnabled } : t
    );
    updateThresholds(updated);
  };

  const handleThemeChange = (theme: 'light' | 'dark' | 'system') => {
    updateSetting('theme', theme);
  };

  const handleStartMinimizedToggle = () => {
    updateSetting('startMinimized', !settings.startMinimized);
  };

  const sessionThresholds = settings.thresholds.filter((t) => t.type === 'session');
  const weeklyThresholds = settings.thresholds.filter((t) => t.type === 'weekly');

  return (
    <div className="settings">
      <header className="settings-header">
        <button className="back-button" onClick={handleBack}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>
        <h1>Settings</h1>
      </header>

      <main className="settings-content">
        {/* Notification Thresholds */}
        <section className="settings-section">
          <h2>Session Alerts</h2>
          <p className="section-description">
            Get notified when your 5-hour session usage reaches these levels
          </p>
          <div className="threshold-list">
            {sessionThresholds.map((threshold) => (
              <ThresholdItem
                key={threshold.id}
                threshold={threshold}
                onToggle={handleThresholdToggle}
                onSoundToggle={handleSoundToggle}
              />
            ))}
          </div>
        </section>

        <section className="settings-section">
          <h2>Weekly Alerts</h2>
          <p className="section-description">
            Get notified when your weekly usage reaches these levels
          </p>
          <div className="threshold-list">
            {weeklyThresholds.map((threshold) => (
              <ThresholdItem
                key={threshold.id}
                threshold={threshold}
                onToggle={handleThresholdToggle}
                onSoundToggle={handleSoundToggle}
              />
            ))}
          </div>
        </section>

        {/* App Settings */}
        <section className="settings-section">
          <h2>App Settings</h2>

          <div className="setting-item">
            <div className="setting-info">
              <span className="setting-label">Theme</span>
            </div>
            <div className="theme-buttons">
              <button
                className={`theme-button ${settings.theme === 'light' ? 'active' : ''}`}
                onClick={() => handleThemeChange('light')}
              >
                Light
              </button>
              <button
                className={`theme-button ${settings.theme === 'dark' ? 'active' : ''}`}
                onClick={() => handleThemeChange('dark')}
              >
                Dark
              </button>
              <button
                className={`theme-button ${settings.theme === 'system' ? 'active' : ''}`}
                onClick={() => handleThemeChange('system')}
              >
                System
              </button>
            </div>
          </div>

          <div className="setting-item">
            <div className="setting-info">
              <span className="setting-label">Start minimized</span>
              <span className="setting-description">
                Start app minimized to system tray
              </span>
            </div>
            <Toggle
              checked={settings.startMinimized}
              onChange={handleStartMinimizedToggle}
            />
          </div>
        </section>

        {/* About */}
        <section className="settings-section">
          <h2>About</h2>
          <div className="about-info">
            <p>Claude Usage Tracker v1.0.0</p>
            <p className="about-description">
              Track your Claude AI subscription usage in real-time
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}

interface ThresholdItemProps {
  threshold: AlertThreshold;
  onToggle: (id: string) => void;
  onSoundToggle: (id: string) => void;
}

function ThresholdItem({ threshold, onToggle, onSoundToggle }: ThresholdItemProps) {
  return (
    <div className={`threshold-item ${threshold.enabled ? '' : 'disabled'}`}>
      <div className="threshold-main">
        <span className="threshold-percent">{threshold.percentage}%</span>
        <Toggle checked={threshold.enabled} onChange={() => onToggle(threshold.id)} />
      </div>
      {threshold.enabled && (
        <div className="threshold-options">
          <label className="sound-toggle">
            <input
              type="checkbox"
              checked={threshold.soundEnabled}
              onChange={() => onSoundToggle(threshold.id)}
            />
            <span>Play sound</span>
          </label>
        </div>
      )}
    </div>
  );
}

interface ToggleProps {
  checked: boolean;
  onChange: () => void;
}

function Toggle({ checked, onChange }: ToggleProps) {
  return (
    <button
      className={`toggle ${checked ? 'active' : ''}`}
      onClick={onChange}
      role="switch"
      aria-checked={checked}
    >
      <span className="toggle-knob" />
    </button>
  );
}
