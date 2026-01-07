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
           <img
              src="LOGO.png"
              alt="Claude Usage Tracker Logo"
              className="logo-image"
            />
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
