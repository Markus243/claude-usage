import { EventEmitter } from 'events';
const { net } = require('electron');
import { getStore } from '../storage/SecureStore';
import { getAuthService } from './AuthService';
import { UsageData } from '../ipc/types';

// Claude.ai API endpoints
const BOOTSTRAP_API_URL = 'https://claude.ai/api/bootstrap';
const ORGANIZATIONS_API_URL = 'https://claude.ai/api/organizations';

export class UsageService extends EventEmitter {
  private pollInterval: NodeJS.Timeout | null = null;
  private store = getStore();
  private authService = getAuthService();
  private lastUsage: UsageData | null = null;
  private isPolling = false;

  private readonly DEFAULT_POLL_MS = 60000; // 1 minute
  private readonly ACTIVE_POLL_MS = 30000; // 30 seconds when near limit
  private readonly MAX_RETRIES = 3;

  constructor() {
    super();
  }

  /**
   * Start polling for usage data
   */
  startPolling(): void {
    if (this.isPolling) return;

    this.isPolling = true;
    this.fetchUsage(); // Immediate fetch

    this.pollInterval = setInterval(() => {
      this.fetchUsage();
    }, this.getPollInterval());
  }

  /**
   * Stop polling
   */
  stopPolling(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    this.isPolling = false;
  }

  /**
   * Get current poll interval based on usage level
   */
  private getPollInterval(): number {
    const settings = this.store.getSettings();
    const baseInterval = settings.pollIntervalMs || this.DEFAULT_POLL_MS;

    // Poll more frequently when approaching limits
    if (this.lastUsage?.sessionUsage.percentUsed && this.lastUsage.sessionUsage.percentUsed > 80) {
      return Math.min(baseInterval, this.ACTIVE_POLL_MS);
    }
    return baseInterval;
  }

  /**
   * Fetch usage data from Claude API
   */
  async fetchUsage(): Promise<UsageData | null> {
    const sessionKey = this.authService.getSessionKey();
    if (!sessionKey) {
      this.emit('usage:error', { error: 'Not authenticated' });
      return null;
    }

    let retries = 0;
    while (retries < this.MAX_RETRIES) {
      try {
        const usage = await this.fetchUsageFromAPI(sessionKey);
        this.lastUsage = usage;
        this.store.setCachedUsage(usage);
        this.emit('usage:updated', usage);

        // Update poll interval based on new usage
        this.updatePollInterval();

        return usage;
      } catch (error: any) {
        if (error.status === 401) {
          this.emit('auth:expired');
          this.stopPolling();
          return null;
        }

        retries++;
        if (retries >= this.MAX_RETRIES) {
          console.error('[UsageService] Failed to fetch usage after retries:', error.message);
          this.emit('usage:error', { error: error.message || 'Failed to fetch usage' });

          // Return cached data if available
          const cached = this.store.getCachedUsage();
          if (cached) {
            this.emit('usage:updated', { ...cached, isStale: true });
            return cached;
          }
          return null;
        }

        // Wait before retry with exponential backoff
        await this.delay(1000 * Math.pow(2, retries));
      }
    }

    return null;
  }

  /**
   * Fetch usage data from Claude API
   */
  private async fetchUsageFromAPI(sessionKey: string): Promise<UsageData> {
    // Get bootstrap data for org ID and tier info
    const bootstrapResponse = await this.makeRequest(BOOTSTRAP_API_URL, sessionKey);

    if (!bootstrapResponse.ok) {
      const error = new Error(`Bootstrap API failed: ${bootstrapResponse.status}`);
      (error as any).status = bootstrapResponse.status;
      throw error;
    }

    const bootstrapData = await bootstrapResponse.json();

    // Extract organization ID
    const orgId = bootstrapData.account?.memberships?.[0]?.organization?.uuid;
    if (!orgId) {
      throw new Error('Could not find organization ID');
    }

    // Fetch usage data from the organization usage endpoint
    const usageUrl = `${ORGANIZATIONS_API_URL}/${orgId}/usage`;
    const usageResponse = await this.makeRequest(usageUrl, sessionKey);

    let rateLimitData: any = null;
    if (usageResponse.ok) {
      rateLimitData = await usageResponse.json();
    }

    return this.parseUsageResponse(bootstrapData, rateLimitData);
  }

  /**
   * Make an authenticated request to Claude API
   */
  private async makeRequest(url: string, sessionKey: string): Promise<Response> {
    return new Promise((resolve, reject) => {
      const request = net.request({
        method: 'GET',
        url,
      });

      request.setHeader('Cookie', `sessionKey=${sessionKey}`);
      request.setHeader('Content-Type', 'application/json');
      request.setHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
      request.setHeader('Accept', 'application/json');

      let responseData = '';
      let statusCode = 0;

      request.on('response', (response: any) => {
        statusCode = response.statusCode;

        response.on('data', (chunk: Buffer) => {
          responseData += chunk.toString();
        });

        response.on('end', () => {
          resolve({
            ok: statusCode >= 200 && statusCode < 300,
            status: statusCode,
            json: () => Promise.resolve(JSON.parse(responseData)),
            text: () => Promise.resolve(responseData),
          } as Response);
        });
      });

      request.on('error', (error: Error) => {
        reject(error);
      });

      request.end();
    });
  }

  /**
   * Parse the API response into UsageData format
   */
  private parseUsageResponse(bootstrapData: any, rateLimitData?: any): UsageData {
    const now = new Date().toISOString();

    // Parse utilization from usage endpoint
    // Structure: { five_hour: { utilization: 15, resets_at: "..." }, seven_day: { utilization: 3, resets_at: "..." } }
    let fiveHourUtilization: number = 0;
    let fiveHourResetAt: string | null = null;
    let sevenDayUtilization: number = 0;
    let sevenDayResetAt: string | null = null;

    if (rateLimitData) {
      if (rateLimitData.five_hour) {
        fiveHourUtilization = rateLimitData.five_hour.utilization ?? 0;
        fiveHourResetAt = rateLimitData.five_hour.resets_at || null;
      }

      if (rateLimitData.seven_day) {
        sevenDayUtilization = rateLimitData.seven_day.utilization ?? 0;
        sevenDayResetAt = rateLimitData.seven_day.resets_at || null;
      }
    }

    // Detect subscription tier from organization.rate_limit_tier
    let tier: UsageData['subscriptionTier'] = 'pro';

    const membership = bootstrapData.account?.memberships?.[0];
    if (membership?.organization?.rate_limit_tier) {
      const rateLimitTier = membership.organization.rate_limit_tier.toLowerCase();

      if (rateLimitTier.includes('max_20') || rateLimitTier.includes('20x')) {
        tier = 'max20';
      } else if (rateLimitTier.includes('max_5') || rateLimitTier.includes('5x') || rateLimitTier.includes('claude_max')) {
        tier = 'max5';
      } else if (rateLimitTier.includes('pro') || rateLimitTier.includes('plus')) {
        tier = 'pro';
      } else if (rateLimitTier.includes('free') || rateLimitTier.includes('basic')) {
        tier = 'free';
      }
    }

    // Parse reset times from API or calculate fallback
    const sessionResetAt = this.parseResetTime(fiveHourResetAt) || this.calculateSessionReset();
    const weeklyResetAt = this.parseResetTime(sevenDayResetAt) || this.calculateWeeklyReset();

    // Estimated limits by tier (API only provides percentages)
    const tierLimits: Record<string, { session: number; weekly: number }> = {
      free: { session: 10, weekly: 50 },
      pro: { session: 45, weekly: 500 },
      max5: { session: 225, weekly: 2500 },
      max20: { session: 900, weekly: 10000 },
      unknown: { session: 45, weekly: 500 },
    };

    const limits = tierLimits[tier] || tierLimits.pro;
    const sessionUsed = Math.round((fiveHourUtilization / 100) * limits.session);
    const weeklyUsed = Math.round((sevenDayUtilization / 100) * limits.weekly);

    return {
      sessionUsage: {
        used: sessionUsed,
        limit: limits.session,
        percentUsed: fiveHourUtilization,
        resetAt: sessionResetAt,
      },
      weeklyUsage: {
        used: weeklyUsed,
        limit: limits.weekly,
        percentUsed: sevenDayUtilization,
        resetAt: weeklyResetAt,
      },
      subscriptionTier: tier,
      lastUpdated: now,
    };
  }

  /**
   * Parse ISO date string, return null if invalid
   */
  private parseResetTime(dateStr: string | null): string | null {
    if (!dateStr) return null;
    try {
      const date = new Date(dateStr);
      return isNaN(date.getTime()) ? null : date.toISOString();
    } catch {
      return null;
    }
  }

  /**
   * Calculate next session reset time (5-hour window fallback)
   */
  private calculateSessionReset(): string {
    const now = new Date();
    const msIn5Hours = 5 * 60 * 60 * 1000;
    const epoch = new Date('2024-01-01T00:00:00Z').getTime();
    const timeSinceEpoch = now.getTime() - epoch;
    const currentWindow = Math.floor(timeSinceEpoch / msIn5Hours);
    const nextReset = new Date(epoch + (currentWindow + 1) * msIn5Hours);
    return nextReset.toISOString();
  }

  /**
   * Calculate next weekly reset time (Sunday fallback)
   */
  private calculateWeeklyReset(): string {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const daysUntilSunday = dayOfWeek === 0 ? 7 : 7 - dayOfWeek;
    const nextSunday = new Date(now);
    nextSunday.setDate(now.getDate() + daysUntilSunday);
    nextSunday.setHours(11, 0, 0, 0);
    return nextSunday.toISOString();
  }

  /**
   * Update poll interval based on current usage
   */
  private updatePollInterval(): void {
    if (!this.pollInterval || !this.isPolling) return;

    clearInterval(this.pollInterval);
    this.pollInterval = setInterval(() => {
      this.fetchUsage();
    }, this.getPollInterval());
  }

  /**
   * Helper to delay execution
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get last fetched usage data
   */
  getLastUsage(): UsageData | null {
    return this.lastUsage || this.store.getCachedUsage();
  }

  /**
   * Force refresh usage data
   */
  async refresh(): Promise<UsageData | null> {
    return this.fetchUsage();
  }
}

// Singleton instance
let usageServiceInstance: UsageService | null = null;

export function getUsageService(): UsageService {
  if (!usageServiceInstance) {
    usageServiceInstance = new UsageService();
  }
  return usageServiceInstance;
}
