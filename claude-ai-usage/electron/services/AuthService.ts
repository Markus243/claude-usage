const { BrowserWindow, session } = require('electron');
import { getStore } from '../storage/SecureStore';
import { EventEmitter } from 'events';

const CLAUDE_LOGIN_URL = 'https://claude.ai/login';
// Claude redirects to these URLs after successful login
const CLAUDE_SUCCESS_PATTERNS = [
  '/new',
  '/chat',
  '/project',
  '/recents',
  '/settings',
];

export class AuthService extends EventEmitter {
  private loginWindow: InstanceType<typeof BrowserWindow> | null = null;
  private store = getStore();

  constructor() {
    super();
  }

  /**
   * Check if user has a valid session
   */
  async checkSession(): Promise<boolean> {
    const sessionKey = this.store.getSessionKey();
    if (!sessionKey) {
      return false;
    }

    // Validate session by making a test request
    try {
      const isValid = await this.validateSessionKey(sessionKey);
      if (!isValid) {
        this.store.clearAuth();
        this.emit('auth:expired');
        return false;
      }
      return true;
    } catch (error) {
      console.error('Session validation error:', error);
      return false;
    }
  }

  /**
   * Validate session key by making a request to Claude API
   */
  private async validateSessionKey(sessionKey: string): Promise<boolean> {
    try {
      const response = await fetch('https://claude.ai/api/auth/session', {
        method: 'GET',
        headers: {
          'Cookie': `sessionKey=${sessionKey}`,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Open login window and capture session cookie
   */
  async login(): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      // Use a dedicated session partition for auth
      const authSession = session.fromPartition('persist:claude-auth');

      // Clear existing cookies before login
      authSession.clearStorageData({ storages: ['cookies'] });

      this.loginWindow = new BrowserWindow({
        width: 500,
        height: 700,
        title: 'Login to Claude',
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          session: authSession,
        },
        autoHideMenuBar: true,
        resizable: true,
      });

      let resolved = false;

      const checkLoginSuccess = async (url: string) => {
        if (resolved) return;

        // Check if we're on a success page (not login or oauth)
        const urlObj = new URL(url);
        const isClaudeAi = urlObj.hostname === 'claude.ai' || urlObj.hostname.endsWith('.claude.ai');
        const isSuccessPage = isClaudeAi &&
          CLAUDE_SUCCESS_PATTERNS.some(pattern => urlObj.pathname.startsWith(pattern));
        const isLoginPage = urlObj.pathname === '/login' || urlObj.pathname.startsWith('/oauth');

        console.log('Navigation check:', { url, isClaudeAi, isSuccessPage, isLoginPage });

        if (isSuccessPage && !isLoginPage) {
          try {
            // Small delay to ensure cookies are set
            await new Promise(r => setTimeout(r, 500));

            const sessionKey = await this.captureSessionCookie(authSession);
            console.log('Session key captured:', sessionKey ? 'yes' : 'no');

            if (sessionKey) {
              resolved = true;
              this.store.setSessionKey(sessionKey);
              this.store.setSessionExpiry(null);
              this.emit('auth:success');
              this.closeLoginWindow();
              resolve({ success: true });
            }
          } catch (error) {
            console.error('Login capture error:', error);
          }
        }
      };

      // Track both navigation types
      this.loginWindow.webContents.on('did-navigate', async (_event: Electron.Event, url: string) => {
        await checkLoginSuccess(url);
      });

      this.loginWindow.webContents.on('did-navigate-in-page', async (_event: Electron.Event, url: string) => {
        await checkLoginSuccess(url);
      });

      // Handle window close without completing login
      this.loginWindow.on('closed', () => {
        this.loginWindow = null;
        resolve({ success: false, error: 'Login window closed' });
      });

      // Load login page
      this.loginWindow.loadURL(CLAUDE_LOGIN_URL);
    });
  }

  /**
   * Extract sessionKey cookie from the auth session
   */
  private async captureSessionCookie(authSession: Electron.Session): Promise<string | null> {
    try {
      const cookies = await authSession.cookies.get({ domain: '.claude.ai' });
      const sessionCookie = cookies.find(
        (c) => c.name === 'sessionKey' && c.value.startsWith('sk-ant-sid01-')
      );
      return sessionCookie?.value ?? null;
    } catch (error) {
      console.error('Error capturing session cookie:', error);
      return null;
    }
  }

  /**
   * Close the login window if open
   */
  private closeLoginWindow(): void {
    if (this.loginWindow && !this.loginWindow.isDestroyed()) {
      this.loginWindow.close();
      this.loginWindow = null;
    }
  }

  /**
   * Log out and clear stored credentials
   */
  async logout(): Promise<void> {
    this.store.clearAuth();

    // Clear cookies from auth session
    const authSession = session.fromPartition('persist:claude-auth');
    await authSession.clearStorageData({ storages: ['cookies'] });

    this.emit('auth:logout');
  }

  /**
   * Get current session key (for API requests)
   */
  getSessionKey(): string | null {
    return this.store.getSessionKey();
  }

  /**
   * Check if authenticated
   */
  isAuthenticated(): boolean {
    return this.store.getSessionKey() !== null;
  }
}

// Singleton instance
let authServiceInstance: AuthService | null = null;

export function getAuthService(): AuthService {
  if (!authServiceInstance) {
    authServiceInstance = new AuthService();
  }
  return authServiceInstance;
}
