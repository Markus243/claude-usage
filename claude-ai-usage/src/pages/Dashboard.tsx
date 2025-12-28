import { useNavigate } from 'react-router-dom';
import { useUsageStore } from '../stores/usageStore';
import { useAuthStore } from '../stores/authStore';
import { UsageCard } from '../components/UsageCard';
import { formatDistanceToNow } from 'date-fns';
import './Dashboard.css';

export function Dashboard() {
  const navigate = useNavigate();
  const { usage, isLoading, isStale, error, lastUpdated, refresh } = useUsageStore();
  const { logout } = useAuthStore();

  const handleRefresh = async () => {
    await refresh();
  };

  const handleOpenClaude = () => {
    window.claudeUsage.app.openExternal('https://claude.ai');
  };

  const handleSettings = () => {
    navigate('/settings');
  };

  const handleLogout = async () => {
    await logout();
  };

  const handleMinimize = () => {
    window.claudeUsage.window.minimizeToTray();
  };

  const getTierLabel = (tier: string) => {
    const labels: Record<string, string> = {
      free: 'Free',
      pro: 'Pro',
      max5: 'Max 5x',
      max20: 'Max 20x',
      unknown: 'Unknown',
    };
    return labels[tier] || tier;
  };

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div className="header-left">
          <h1>Claude Usage</h1>
          {usage && (
            <span className="tier-badge">{getTierLabel(usage.subscriptionTier)}</span>
          )}
        </div>
        <div className="header-actions">
          <button
            className="icon-button"
            onClick={handleRefresh}
            disabled={isLoading}
            title="Refresh"
          >
            <svg
              className={`refresh-icon ${isLoading ? 'spinning' : ''}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M23 4v6h-6M1 20v-6h6" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
          </button>
          <button className="icon-button" onClick={handleSettings} title="Settings">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
          <button className="icon-button" onClick={handleMinimize} title="Minimize to tray">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
        </div>
      </header>

      <main className="dashboard-content">
        {error && (
          <div className="error-banner">
            <span>{error}</span>
            <button onClick={handleRefresh}>Retry</button>
          </div>
        )}

        {isStale && (
          <div className="stale-banner">
            <span>Data may be outdated</span>
          </div>
        )}

        {usage ? (
          <>
            <div className="usage-cards">
              <UsageCard
                title="5-Hour Session"
                usage={usage.sessionUsage}
                variant="session"
              />
              <UsageCard
                title="Weekly Limit"
                usage={usage.weeklyUsage}
                variant="weekly"
              />
            </div>

            {usage.modelUsage && (
              <div className="model-usage">
                <h3>Model Usage</h3>
                <div className="model-bars">
                  {usage.modelUsage.opus && (
                    <div className="model-bar">
                      <span className="model-name">Opus</span>
                      <div className="bar-container">
                        <div
                          className="bar-fill opus"
                          style={{ width: `${usage.modelUsage.opus.percentUsed}%` }}
                        />
                      </div>
                      <span className="model-percent">
                        {usage.modelUsage.opus.percentUsed}%
                      </span>
                    </div>
                  )}
                  {usage.modelUsage.sonnet && (
                    <div className="model-bar">
                      <span className="model-name">Sonnet</span>
                      <div className="bar-container">
                        <div
                          className="bar-fill sonnet"
                          style={{ width: `${usage.modelUsage.sonnet.percentUsed}%` }}
                        />
                      </div>
                      <span className="model-percent">
                        {usage.modelUsage.sonnet.percentUsed}%
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="no-data">
            <p>No usage data available</p>
            <button onClick={handleRefresh} disabled={isLoading}>
              {isLoading ? 'Loading...' : 'Refresh'}
            </button>
          </div>
        )}
      </main>

      <footer className="dashboard-footer">
        <div className="footer-left">
          {lastUpdated && (
            <span className="last-updated">
              Updated {formatDistanceToNow(lastUpdated, { addSuffix: true })}
            </span>
          )}
        </div>
        <div className="footer-actions">
          <button className="text-button" onClick={handleOpenClaude}>
            Open Claude
          </button>
          <button className="text-button logout" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </footer>
    </div>
  );
}
