const { nativeImage } = require('electron');
import type { NativeImage } from 'electron';

export type TrayStatus = 'good' | 'warning' | 'critical' | 'unknown' | 'offline';

interface IconColors {
  background: string;
  foreground: string;
  badge: string;
  badgeText: string;
}

const STATUS_COLORS: Record<TrayStatus, IconColors> = {
  good: {
    background: '#1a1a2e',
    foreground: '#D97706', // Claude orange
    badge: '#22C55E', // Green
    badgeText: '#FFFFFF',
  },
  warning: {
    background: '#1a1a2e',
    foreground: '#D97706',
    badge: '#EAB308', // Yellow
    badgeText: '#000000',
  },
  critical: {
    background: '#1a1a2e',
    foreground: '#D97706',
    badge: '#EF4444', // Red
    badgeText: '#FFFFFF',
  },
  unknown: {
    background: '#1a1a2e',
    foreground: '#6B7280', // Gray
    badge: '#6B7280',
    badgeText: '#FFFFFF',
  },
  offline: {
    background: '#1a1a2e',
    foreground: '#6B7280',
    badge: '#374151',
    badgeText: '#9CA3AF',
  },
};

export class TrayIconGenerator {
  private iconCache: Map<string, NativeImage> = new Map();

  /**
   * Generate a tray icon with status badge
   */
  generate(percent: number, status: TrayStatus): NativeImage {
    const cacheKey = `${percent}-${status}`;

    // Check cache
    const cached = this.iconCache.get(cacheKey);
    if (cached) return cached;

    // Generate SVG-based icon
    const svg = this.generateSVG(percent, status);
    const icon = nativeImage.createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`);

    // Cache the icon
    this.iconCache.set(cacheKey, icon);

    return icon;
  }

  /**
   * Generate SVG string for the icon
   */
  private generateSVG(percent: number, status: TrayStatus): string {
    const colors = STATUS_COLORS[status];
    const displayPercent = Math.min(Math.max(0, percent), 100);

    // Create a simple icon with a "C" for Claude and a colored badge
    return `
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">
        <!-- Background circle -->
        <circle cx="7" cy="8" r="6" fill="${colors.background}"/>

        <!-- Claude "C" shape -->
        <path d="M 9.5 5
                 C 8.5 4 6 4 5 5.5
                 C 4 7 4 9 5 10.5
                 C 6 12 8.5 12 9.5 11"
              stroke="${colors.foreground}"
              stroke-width="2"
              fill="none"
              stroke-linecap="round"/>

        <!-- Status badge circle -->
        <circle cx="12" cy="12" r="4" fill="${colors.badge}"/>

        <!-- Badge text (percentage indicator) -->
        ${this.getBadgeContent(displayPercent, colors)}
      </svg>
    `;
  }

  /**
   * Get badge content based on percentage
   */
  private getBadgeContent(percent: number, colors: IconColors): string {
    if (percent >= 100) {
      // Show "!" for at limit
      return `<text x="12" y="14" text-anchor="middle" font-size="6" font-weight="bold" fill="${colors.badgeText}">!</text>`;
    } else if (percent >= 90) {
      // Show "!" for critical
      return `<text x="12" y="14" text-anchor="middle" font-size="6" font-weight="bold" fill="${colors.badgeText}">!</text>`;
    } else {
      // Show abbreviated percentage (e.g., 45 -> "4", 75 -> "7")
      const abbreviated = Math.floor(percent / 10);
      return `<text x="12" y="14" text-anchor="middle" font-size="5" font-weight="bold" fill="${colors.badgeText}">${abbreviated}</text>`;
    }
  }

  /**
   * Get status based on percentage
   */
  static getStatus(percent: number): TrayStatus {
    if (percent >= 90) return 'critical';
    if (percent >= 75) return 'warning';
    if (percent >= 0) return 'good';
    return 'unknown';
  }

  /**
   * Clear icon cache
   */
  clearCache(): void {
    this.iconCache.clear();
  }

  /**
   * Generate a simple base icon (for when usage is unknown)
   */
  generateBaseIcon(): NativeImage {
    return this.generate(0, 'unknown');
  }
}

// Singleton instance
let iconGeneratorInstance: TrayIconGenerator | null = null;

export function getTrayIconGenerator(): TrayIconGenerator {
  if (!iconGeneratorInstance) {
    iconGeneratorInstance = new TrayIconGenerator();
  }
  return iconGeneratorInstance;
}
