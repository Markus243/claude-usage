const { Tray, Menu, app, shell, nativeImage } = require('electron');
const path = require('node:path');
const fs = require('fs');
import type { BrowserWindow as BrowserWindowType, MenuItemConstructorOptions } from 'electron';
import { EventEmitter } from 'events';
import { getTrayIconGenerator, TrayIconGenerator } from './TrayIconGenerator';
import { UsageData } from '../ipc/types';
import { formatDistanceToNow } from 'date-fns';

export class TrayManager extends EventEmitter {
  private tray: typeof Tray | null = null;
  private iconGenerator: TrayIconGenerator;
  private mainWindow: BrowserWindowType | null = null;
  private currentUsage: UsageData | null = null;
  private isAuthenticated = false;

  constructor() {
    super();
    this.iconGenerator = getTrayIconGenerator();
  }

  private getIconPath(): string {
    const possiblePaths: string[] = [];

    // 1. Check unpacked resources (production best practice)
    // This looks for resources/LOGO.png which is set in electron-builder extraResources
    if (app.isPackaged) {
      possiblePaths.push(path.join(process.resourcesPath, 'LOGO.png'));
    }

    // 2. Check VITE_PUBLIC env var (standard dev/prod location)
    if (process.env.VITE_PUBLIC) {
      possiblePaths.push(path.join(process.env.VITE_PUBLIC, 'LOGO.png'));
    }

    // 3. Check inside app bundle (fallback for production)
    // Using simple path resolution relative to app root
    const appPath = app.getAppPath(); // Usually ends in resources/app.asar
    possiblePaths.push(path.join(appPath, 'dist', 'LOGO.png'));
    possiblePaths.push(path.join(appPath, 'public', 'LOGO.png'));

    // 4. Dev fallback
    possiblePaths.push(path.join(process.cwd(), 'public', 'LOGO.png'));

    console.log('Searching for tray icon in:', possiblePaths);

    for (const p of possiblePaths) {
      try {
        if (fs.existsSync(p)) {
          console.log('Found tray icon at:', p);
          return p;
        }
      } catch (e) {
        console.error('Error checking path:', p, e);
      }
    }

    // Final fallback to prevent crash, even if file might not exist
    return path.join(process.env.VITE_PUBLIC || '', 'LOGO.png');
  }

  /**
   * Initialize the system tray
   */
  initialize(mainWindow: BrowserWindowType): void {
    // Clean up existing tray if any
    if (this.tray) {
      this.tray.destroy();
      this.tray = null;
    }

    this.mainWindow = mainWindow;

    // Create tray with initial icon
    // Use LOGO.png as base icon to ensure visibility
    const iconPath = this.getIconPath();
    
    console.log('Initializing Tray with icon path:', iconPath);
    if (!fs.existsSync(iconPath)) {
      console.error('Tray icon file not found at:', iconPath);
    }

    // Create native image and resize it to appropriate size for tray (16x16 for Windows)
    const icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
    
    this.tray = new Tray(icon);

    this.tray.setToolTip('Claude Usage Tracker - Loading...');
    this.tray.setContextMenu(this.buildContextMenu());

    // Click to toggle main window
    this.tray.on('click', () => {
      this.toggleMainWindow();
    });

    // Double-click to show and focus
    this.tray.on('double-click', () => {
      this.showMainWindow();
    });
  }

  /**
   * Update tray with new usage data
   */
  updateUsage(usage: UsageData): void {
    if (!this.tray) return;

    this.currentUsage = usage;
    this.isAuthenticated = true;

    // Use standard LOGO.png for stability on Windows
    // Dynamic SVG generation is unreliable in production builds
    const iconPath = this.getIconPath();
    try {
      const icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
      this.tray.setImage(icon);
    } catch (e) {
      console.error('Failed to set usage icon:', e);
    }

    // Update tooltip
    this.tray.setToolTip(this.buildTooltip(usage));

    // Update context menu
    this.tray.setContextMenu(this.buildContextMenu());
  }

  /**
   * Set authentication state
   */
  setAuthState(authenticated: boolean): void {
    this.isAuthenticated = authenticated;

    if (!authenticated) {
      this.currentUsage = null;
      if (this.tray) {
        // Use LOGO.png when not logged in
        const iconPath = this.getIconPath();
        try {
           const icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
           this.tray.setImage(icon);
        } catch (e) {
           console.error('Failed to set auth state icon:', e);
        }
        this.tray.setToolTip('Claude Usage Tracker - Not logged in');
        this.tray.setContextMenu(this.buildContextMenu());
      }
    }
  }

  /**
   * Set offline state
   */
  setOfflineState(): void {
    if (!this.tray) return;

    // Use LOGO.png when offline
    const iconPath = this.getIconPath();
    try {
        const icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
        this.tray.setImage(icon);
    } catch (e) {
        console.error('Failed to set offline state icon:', e);
    }

    if (this.currentUsage) {
      this.tray.setToolTip(this.buildTooltip(this.currentUsage) + '\n\n[Offline - Data may be stale]');
    } else {
      this.tray.setToolTip('Claude Usage Tracker - Offline');
    }
  }

  /**
   * Build tooltip string with usage details
   */
  private buildTooltip(usage: UsageData): string {
    const sessionPercent = usage.sessionUsage.percentUsed;
    const weeklyPercent = usage.weeklyUsage.percentUsed;

    const sessionReset = this.formatResetTime(usage.sessionUsage.resetAt);
    const weeklyReset = this.formatResetTime(usage.weeklyUsage.resetAt);

    const tierLabel = this.getTierLabel(usage.subscriptionTier);

    return [
      'Claude Usage Tracker',
      '─'.repeat(20),
      `Session (5hr): ${sessionPercent}%`,
      `${this.createProgressBar(sessionPercent)}`,
      '',
      `Weekly: ${weeklyPercent}%`,
      `${this.createProgressBar(weeklyPercent)}`,
      '',
      `Resets: ${sessionReset} | ${weeklyReset}`,
      tierLabel ? `Plan: ${tierLabel}` : '',
    ]
      .filter(Boolean)
      .join('\n');
  }

  /**
   * Create ASCII progress bar
   */
  private createProgressBar(percent: number): string {
    const width = 18;
    const filled = Math.round((percent / 100) * width);
    const empty = width - filled;
    return `[${'█'.repeat(filled)}${'░'.repeat(empty)}]`;
  }

  /**
   * Format reset time as relative string
   */
  private formatResetTime(isoString: string): string {
    try {
      const date = new Date(isoString);
      return formatDistanceToNow(date, { addSuffix: false });
    } catch {
      return 'Unknown';
    }
  }

  /**
   * Get human-readable tier label
   */
  private getTierLabel(tier: UsageData['subscriptionTier']): string {
    const labels: Record<typeof tier, string> = {
      free: 'Free',
      pro: 'Pro',
      max5: 'Max 5x',
      max20: 'Max 20x',
      unknown: '',
    };
    return labels[tier];
  }

  /**
   * Build context menu
   */
  private buildContextMenu(): typeof Menu {
    const menuItems: MenuItemConstructorOptions[] = [
      {
        label: 'Open Dashboard',
        click: () => this.showMainWindow(),
      },
      { type: 'separator' },
    ];

    if (this.isAuthenticated && this.currentUsage) {
      const sessionStatus = this.getStatusIcon(this.currentUsage.sessionUsage.percentUsed);
      const weeklyStatus = this.getStatusIcon(this.currentUsage.weeklyUsage.percentUsed);

      menuItems.push(
        {
          label: `${sessionStatus} Session: ${this.currentUsage.sessionUsage.percentUsed}%`,
          enabled: false,
        },
        {
          label: `${weeklyStatus} Weekly: ${this.currentUsage.weeklyUsage.percentUsed}%`,
          enabled: false,
        },
        { type: 'separator' },
        {
          label: 'Refresh Now',
          click: () => this.emit('refresh'),
        }
      );
    } else if (!this.isAuthenticated) {
      menuItems.push({
        label: 'Login to Claude',
        click: () => this.emit('login'),
      });
    } else {
      menuItems.push({
        label: 'Loading...',
        enabled: false,
      });
    }

    menuItems.push(
      { type: 'separator' },
      {
        label: 'Open Claude.ai',
        click: () => shell.openExternal('https://claude.ai'),
      },
      {
        label: 'Settings',
        click: () => {
          this.showMainWindow();
          this.emit('show-settings');
        },
      },
      { type: 'separator' }
    );

    if (this.isAuthenticated) {
      menuItems.push({
        label: 'Logout',
        click: () => this.emit('logout'),
      });
    }

    menuItems.push({
      label: 'Quit',
      click: () => app.quit(),
    });

    return Menu.buildFromTemplate(menuItems);
  }

  /**
   * Get status icon emoji based on percentage
   */
  private getStatusIcon(percent: number): string {
    if (percent >= 90) return '🔴';
    if (percent >= 75) return '🟡';
    return '🟢';
  }

  /**
   * Toggle main window visibility
   */
  private toggleMainWindow(): void {
    if (!this.mainWindow) return;

    if (this.mainWindow.isVisible()) {
      this.mainWindow.hide();
    } else {
      this.showMainWindow();
    }
  }

  /**
   * Show and focus main window
   */
  private showMainWindow(): void {
    if (!this.mainWindow) return;

    this.mainWindow.show();
    this.mainWindow.focus();
  }

  /**
   * Destroy the tray
   */
  destroy(): void {
    if (this.tray) {
      this.tray.destroy();
      this.tray = null;
    }
  }

  /**
   * Check if tray is initialized
   */
  isInitialized(): boolean {
    return this.tray !== null;
  }
}

// Singleton instance
let trayManagerInstance: TrayManager | null = null;

export function getTrayManager(): TrayManager {
  if (!trayManagerInstance) {
    trayManagerInstance = new TrayManager();
  }
  return trayManagerInstance;
}
