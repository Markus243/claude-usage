const { Tray, Menu, app, shell } = require('electron');
const path = require('node:path');
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
    const iconPath = path.join(process.env.VITE_PUBLIC || '', 'LOGO.png');
    this.tray = new Tray(iconPath);

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

    // Update icon based on session usage (primary indicator)
    const percent = usage.sessionUsage.percentUsed;
    const status = TrayIconGenerator.getStatus(percent);
    const icon = this.iconGenerator.generate(percent, status);
    this.tray.setImage(icon);

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
        const iconPath = path.join(process.env.VITE_PUBLIC || '', 'LOGO.png');
        this.tray.setImage(iconPath);
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
    const iconPath = path.join(process.env.VITE_PUBLIC || '', 'LOGO.png');
    this.tray.setImage(iconPath);

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
