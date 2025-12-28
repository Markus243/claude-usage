const { nativeImage } = require('electron');
import type { NativeImage } from 'electron';

export type TrayStatus = 'good' | 'warning' | 'critical' | 'unknown' | 'offline';

interface IconColors {
  background: string;
  ring: string;
  fill: string;
  text: string;
  accent: string;
}

const STATUS_COLORS: Record<TrayStatus, IconColors> = {
  good: {
    background: '#1a1a2e',
    ring: '#2d3748',
    fill: '#22C55E',
    text: '#FFFFFF',
    accent: '#D97706',
  },
  warning: {
    background: '#1a1a2e',
    ring: '#2d3748',
    fill: '#EAB308',
    text: '#000000',
    accent: '#D97706',
  },
  critical: {
    background: '#1a1a2e',
    ring: '#2d3748',
    fill: '#EF4444',
    text: '#FFFFFF',
    accent: '#EF4444',
  },
  unknown: {
    background: '#1a1a2e',
    ring: '#2d3748',
    fill: '#6B7280',
    text: '#FFFFFF',
    accent: '#6B7280',
  },
  offline: {
    background: '#1a1a2e',
    ring: '#2d3748',
    fill: '#374151',
    text: '#9CA3AF',
    accent: '#374151',
  },
};

export class TrayIconGenerator {
  private iconCache: Map<string, NativeImage> = new Map();

  /**
   * Generate a tray icon with usage percentage
   */
  generate(percent: number, status: TrayStatus): NativeImage {
    const cacheKey = `${percent}-${status}`;

    // Check cache
    const cached = this.iconCache.get(cacheKey);
    if (cached) return cached;

    // Generate SVG-based icon (16x16 is standard for system tray)
    const svg = this.generateSVG(percent, status);
    const icon = nativeImage.createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`);

    // Cache the icon
    this.iconCache.set(cacheKey, icon);

    return icon;
  }

  /**
   * Generate SVG string for the icon - circular progress with percentage
   */
  private generateSVG(percent: number, status: TrayStatus): string {
    const colors = STATUS_COLORS[status];
    const displayPercent = Math.min(Math.max(0, Math.round(percent)), 100);

    // Calculate progress arc
    const radius = 6;
    const circumference = 2 * Math.PI * radius;
    const strokeDasharray = (displayPercent / 100) * circumference;

    // For Windows system tray, we need a clear, bold icon
    return `
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">
        <!-- Background circle -->
        <circle cx="8" cy="8" r="7" fill="${colors.background}" stroke="${colors.ring}" stroke-width="0.5"/>

        <!-- Progress ring background -->
        <circle cx="8" cy="8" r="${radius}" fill="none" stroke="${colors.ring}" stroke-width="2"/>

        <!-- Progress ring fill -->
        <circle cx="8" cy="8" r="${radius}"
                fill="none"
                stroke="${colors.fill}"
                stroke-width="2"
                stroke-linecap="round"
                stroke-dasharray="${strokeDasharray} ${circumference}"
                transform="rotate(-90 8 8)"/>

        <!-- Center text - show percentage number -->
        ${this.getCenterContent(displayPercent, colors)}
      </svg>
    `;
  }

  /**
   * Get center content based on percentage
   */
  private getCenterContent(percent: number, colors: IconColors): string {
    if (percent >= 100) {
      // Show "!" for at limit
      return `<text x="8" y="11" text-anchor="middle" font-family="Arial, sans-serif" font-size="8" font-weight="bold" fill="${colors.fill}">!</text>`;
    }

    // Show percentage number (just the tens digit for small icon)
    if (percent < 10) {
      return `<text x="8" y="11" text-anchor="middle" font-family="Arial, sans-serif" font-size="7" font-weight="bold" fill="${colors.text}">${percent}</text>`;
    }

    // For 10-99%, show the number
    return `<text x="8" y="10.5" text-anchor="middle" font-family="Arial, sans-serif" font-size="6" font-weight="bold" fill="${colors.text}">${percent}</text>`;
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
