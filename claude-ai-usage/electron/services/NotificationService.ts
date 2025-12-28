const { Notification } = require('electron');
import { EventEmitter } from 'events';
import { getStore } from '../storage/SecureStore';
import { AlertThreshold, UsageData } from '../ipc/types';

export class NotificationService extends EventEmitter {
  private store = getStore();
  private triggeredAlerts: Set<string> = new Set();
  private lastSessionResetAt: string | null = null;
  private lastWeeklyResetAt: string | null = null;

  constructor() {
    super();
  }

  /**
   * Check thresholds against current usage and trigger notifications
   */
  checkThresholds(usage: UsageData): void {
    const settings = this.store.getSettings();
    const thresholds = settings.thresholds;

    // Reset triggered alerts if usage has reset
    this.checkForUsageReset(usage);

    for (const threshold of thresholds) {
      if (!threshold.enabled) continue;

      const currentPercent =
        threshold.type === 'session'
          ? usage.sessionUsage.percentUsed
          : usage.weeklyUsage.percentUsed;

      const alertKey = `${threshold.type}-${threshold.percentage}`;

      // Only trigger once per reset cycle
      if (currentPercent >= threshold.percentage && !this.triggeredAlerts.has(alertKey)) {
        this.triggerNotification(threshold, currentPercent);
        this.triggeredAlerts.add(alertKey);
      }

      // Reset alert when usage goes below threshold (after reset)
      if (currentPercent < threshold.percentage - 5) {
        // 5% hysteresis
        this.triggeredAlerts.delete(alertKey);
      }
    }
  }

  /**
   * Check if usage has reset and clear triggered alerts
   */
  private checkForUsageReset(usage: UsageData): void {
    // Check session reset
    if (this.lastSessionResetAt && usage.sessionUsage.resetAt !== this.lastSessionResetAt) {
      this.resetAlerts('session');
    }
    this.lastSessionResetAt = usage.sessionUsage.resetAt;

    // Check weekly reset
    if (this.lastWeeklyResetAt && usage.weeklyUsage.resetAt !== this.lastWeeklyResetAt) {
      this.resetAlerts('weekly');
    }
    this.lastWeeklyResetAt = usage.weeklyUsage.resetAt;
  }

  /**
   * Reset alerts for a specific type
   */
  resetAlerts(type: 'session' | 'weekly'): void {
    for (const key of Array.from(this.triggeredAlerts)) {
      if (key.startsWith(type)) {
        this.triggeredAlerts.delete(key);
      }
    }
  }

  /**
   * Trigger a notification for a threshold
   */
  private triggerNotification(threshold: AlertThreshold, currentPercent: number): void {
    const typeLabel = threshold.type === 'session' ? '5-Hour Session' : 'Weekly';
    const urgency = currentPercent >= 90 ? 'critical' : currentPercent >= 75 ? 'warning' : 'info';

    const title = `Claude Usage Alert - ${typeLabel}`;
    const body = `You've used ${currentPercent}% of your ${typeLabel.toLowerCase()} limit.`;

    // Show system notification
    this.showNotification({
      title,
      body,
      urgency,
      soundEnabled: threshold.soundEnabled,
    });

    // Emit event for UI updates
    this.emit('threshold:triggered', {
      threshold,
      currentPercent,
      usageType: threshold.type,
    });
  }

  /**
   * Show a system notification
   */
  showNotification(options: {
    title: string;
    body: string;
    urgency?: 'info' | 'warning' | 'critical';
    soundEnabled?: boolean;
  }): void {
    const { title, body, urgency = 'info', soundEnabled = false } = options;

    // Check if notifications are supported
    if (!Notification.isSupported()) {
      console.warn('Notifications not supported on this platform');
      return;
    }

    const notification = new Notification({
      title,
      body,
      icon: this.getNotificationIcon(urgency),
      urgency: urgency === 'critical' ? 'critical' : 'normal',
      silent: !soundEnabled,
    });

    notification.on('click', () => {
      this.emit('notification:clicked');
    });

    notification.show();
  }

  /**
   * Get icon path based on urgency level
   */
  private getNotificationIcon(_urgency: 'info' | 'warning' | 'critical'): string | undefined {
    // Return undefined for now - will be set up with actual icons later
    return undefined;
  }

  /**
   * Show a custom notification (for manual triggers)
   */
  showCustomNotification(title: string, body: string, type: 'info' | 'warning' | 'critical' = 'info'): void {
    this.showNotification({
      title,
      body,
      urgency: type,
      soundEnabled: type === 'critical',
    });
  }

  /**
   * Clear all triggered alert states
   */
  clearAllAlerts(): void {
    this.triggeredAlerts.clear();
    this.lastSessionResetAt = null;
    this.lastWeeklyResetAt = null;
  }

  /**
   * Get currently triggered alerts
   */
  getTriggeredAlerts(): string[] {
    return Array.from(this.triggeredAlerts);
  }
}

// Singleton instance
let notificationServiceInstance: NotificationService | null = null;

export function getNotificationService(): NotificationService {
  if (!notificationServiceInstance) {
    notificationServiceInstance = new NotificationService();
  }
  return notificationServiceInstance;
}
