import { useState } from 'react';
import { useAuthStore } from '../stores/authStore';
import './Login.css';

export function Login() {
  const { login, isLoading, error } = useAuthStore();
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const handleLogin = async () => {
    setIsLoggingIn(true);
    await login();
    setIsLoggingIn(false);
  };

  return (
    <div className="login-page">
      <div className="login-container">
        <div className="login-header">
          <div className="login-logo">
            <svg viewBox="0 0 24 24" className="claude-icon">
              <circle cx="12" cy="12" r="11" />
              <path
                d="M 15.5 7.5 C 13.5 5.5 8.5 5.5 6.5 9 C 4.5 12.5 4.5 15.5 6.5 18 C 8.5 20.5 13.5 20.5 15.5 18.5"
                strokeWidth="2"
                fill="none"
                strokeLinecap="round"
              />
            </svg>
          </div>
          <h1>Claude Usage Tracker</h1>
          <p className="login-subtitle">
            Monitor your Claude AI subscription usage in real-time
          </p>
        </div>

        <div className="login-features">
          <div className="feature">
            <span className="feature-icon">📊</span>
            <span>Track 5-hour session limits</span>
          </div>
          <div className="feature">
            <span className="feature-icon">📅</span>
            <span>Monitor weekly usage</span>
          </div>
          <div className="feature">
            <span className="feature-icon">🔔</span>
            <span>Get usage alerts</span>
          </div>
          <div className="feature">
            <span className="feature-icon">📌</span>
            <span>System tray widget</span>
          </div>
        </div>

        <div className="login-action">
          <button
            className="login-button"
            onClick={handleLogin}
            disabled={isLoggingIn || isLoading}
          >
            {isLoggingIn ? (
              <>
                <span className="button-spinner" />
                Logging in...
              </>
            ) : (
              'Login with Claude'
            )}
          </button>

          {error && (
            <p className="login-error">
              {error === 'Login window closed'
                ? 'Login was cancelled'
                : error}
            </p>
          )}

          <p className="login-hint">
            You'll be redirected to claude.ai to sign in securely
          </p>
        </div>
      </div>
    </div>
  );
}
