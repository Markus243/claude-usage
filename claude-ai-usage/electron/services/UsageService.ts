import { EventEmitter } from 'events';
const { net } = require('electron');
import { getStore } from '../storage/SecureStore';
import { getAuthService } from './AuthService';
import { UsageData } from '../ipc/types';

// Claude.ai API endpoints (unofficial - may change)
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
          console.error('Failed to fetch usage after retries:', error);
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
   * Make the actual API request to fetch usage
   */
  private async fetchUsageFromAPI(sessionKey: string): Promise<UsageData> {
    // Try bootstrap first to get account info and organization ID
    const bootstrapResponse = await this.makeRequest(BOOTSTRAP_API_URL, sessionKey);

    if (!bootstrapResponse.ok) {
      const error = new Error(`API request failed: ${bootstrapResponse.status}`);
      (error as any).status = bootstrapResponse.status;
      throw error;
    }

    const bootstrapData = await bootstrapResponse.json();

    // Try to get organization ID from bootstrap data
    let orgId: string | null = null;
    if (bootstrapData.account?.memberships?.[0]?.organization?.uuid) {
      orgId = bootstrapData.account.memberships[0].organization.uuid;
      console.log('Found org ID:', orgId);
    }

    // Try multiple endpoints to find rate limit data
    let rateLimitData: any = null;

    if (orgId) {
      // Try rate_limit endpoint - the usage page is at /settings/usage
      // so the API is likely at /api/organizations/{org_id}/...
      const rateLimitEndpoints = [
        `${ORGANIZATIONS_API_URL}/${orgId}/settings/usage`,
        `${ORGANIZATIONS_API_URL}/${orgId}/rate_limit`,
        `${ORGANIZATIONS_API_URL}/${orgId}/usage`,
        `https://claude.ai/api/settings/usage`,
        `https://claude.ai/api/account/usage`,
        `https://claude.ai/api/account/rate_limit`,
        `https://claude.ai/api/usage`,
      ];

      for (const url of rateLimitEndpoints) {
        try {
          console.log('Trying endpoint:', url);
          const response = await this.makeRequest(url, sessionKey);
          if (response.ok) {
            const data = await response.json();
            console.log(`Response from ${url}:`, JSON.stringify(data, null, 2));
            if (data && Object.keys(data).length > 0) {
              rateLimitData = data;
              break;
            }
          } else {
            console.log(`Endpoint ${url} returned status:`, response.status);
          }
        } catch (e) {
          console.log(`Failed to fetch from ${url}:`, e);
        }
      }
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
  private parseUsageResponse(data: any, rateLimitData?: any): UsageData {
    // Log the bootstrap response keys (not full response - too large)
    console.log('Claude API bootstrap keys:', Object.keys(data));
    if (data.account) {
      console.log('Account keys:', Object.keys(data.account));
      if (data.account.memberships?.[0]) {
        console.log('First membership:', JSON.stringify(data.account.memberships[0], null, 2));
      }
    }

    const now = new Date().toISOString();

    // Initialize variables
    let sessionRemaining: number | null = null;
    let sessionResetAt: string | null = null;
    let tier: UsageData['subscriptionTier'] = 'unknown';

    // First priority: Use rate limit data from dedicated /usage endpoint
    // Structure: { five_hour: { utilization: 15, resets_at: "..." }, seven_day: { utilization: 3, resets_at: "..." } }
    let fiveHourUtilization: number | null = null;
    let fiveHourResetAt: string | null = null;
    let sevenDayUtilization: number | null = null;
    let sevenDayResetAt: string | null = null;

    if (rateLimitData) {
      console.log('Using rate limit data from API');

      // Parse five_hour (session) usage
      if (rateLimitData.five_hour) {
        fiveHourUtilization = rateLimitData.five_hour.utilization ?? null;
        fiveHourResetAt = rateLimitData.five_hour.resets_at || null;
        console.log('Five hour utilization:', fiveHourUtilization, '% resets at:', fiveHourResetAt);
      }

      // Parse seven_day (weekly) usage
      if (rateLimitData.seven_day) {
        sevenDayUtilization = rateLimitData.seven_day.utilization ?? null;
        sevenDayResetAt = rateLimitData.seven_day.resets_at || null;
        console.log('Seven day utilization:', sevenDayUtilization, '% resets at:', sevenDayResetAt);
      }
    }

    // Claude's bootstrap API structure - check all known paths
    // The API may return data at different levels depending on the endpoint version

    // Check for messageLimit at root level (common structure)
    if (sessionRemaining === null && data.messageLimit) {
      console.log('Found messageLimit:', data.messageLimit);
      sessionRemaining = data.messageLimit.remaining ?? null;
      sessionResetAt = data.messageLimit.resetsAt || data.messageLimit.reset_at || null;
    }

    // Check account.messageLimit
    if (sessionRemaining === null && data.account?.messageLimit) {
      console.log('Found account.messageLimit:', data.account.messageLimit);
      sessionRemaining = data.account.messageLimit.remaining ?? null;
      sessionResetAt = data.account.messageLimit.resetsAt || data.account.messageLimit.reset_at || null;
    }

    // Check for chat_messages_remaining (alternate structure)
    if (sessionRemaining === null) {
      sessionRemaining = data.chat_messages_remaining ??
                        data.account?.chat_messages_remaining ?? null;
      if (sessionRemaining !== null) {
        console.log('Found chat_messages_remaining:', sessionRemaining);
      }
    }

    // Check rate_limits structure
    if (sessionRemaining === null && (data.rate_limits || data.account?.rate_limits)) {
      const rateLimits = data.rate_limits || data.account?.rate_limits || {};
      console.log('Found rate_limits:', rateLimits);
      sessionRemaining = rateLimits.messages_remaining ?? rateLimits.remaining ?? null;
      sessionResetAt = sessionResetAt || rateLimits.reset_at || rateLimits.resets_at || null;
    }

    // Check for usage object
    if (sessionRemaining === null && (data.usage || data.account?.usage)) {
      const usage = data.usage || data.account?.usage || {};
      console.log('Found usage:', usage);
      sessionRemaining = usage.messages_remaining ?? usage.remaining ?? null;
      sessionResetAt = sessionResetAt || usage.reset_at || usage.resets_at || null;
    }

    // Detect subscription tier from organization.rate_limit_tier
    const account = data.account || {};

    // Check memberships array for rate_limit_tier
    if (data.account?.memberships && Array.isArray(data.account.memberships)) {
      const membership = data.account.memberships[0];
      if (membership?.organization?.rate_limit_tier) {
        const rateLimitTier = membership.organization.rate_limit_tier.toLowerCase();
        console.log('Found rate_limit_tier:', rateLimitTier);

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

      // Also check capabilities array
      if (tier === 'unknown' && membership?.organization?.capabilities) {
        const capabilities = membership.organization.capabilities;
        if (capabilities.includes('claude_max')) {
          tier = 'max5'; // Default to max5 if we see claude_max capability
        }
      }
    }

    // Fallback tier detection from other fields
    if (tier === 'unknown') {
      const hasPaidSub = (account.memberships && account.memberships.length > 0);
      if (hasPaidSub) {
        tier = 'pro'; // Default to pro if they have a membership
      }
    }

    // The API returns utilization as a percentage directly!
    // Use fiveHourUtilization and sevenDayUtilization if available

    // Parse reset times
    let finalSessionResetAt = this.calculateSessionReset();
    if (fiveHourResetAt) {
      try {
        const resetDate = new Date(fiveHourResetAt);
        if (!isNaN(resetDate.getTime())) {
          finalSessionResetAt = resetDate.toISOString();
        }
      } catch (e) {
        console.log('Failed to parse five_hour reset time:', fiveHourResetAt);
      }
    }

    let finalWeeklyResetAt = this.calculateWeeklyReset();
    if (sevenDayResetAt) {
      try {
        const resetDate = new Date(sevenDayResetAt);
        if (!isNaN(resetDate.getTime())) {
          finalWeeklyResetAt = resetDate.toISOString();
        }
      } catch (e) {
        console.log('Failed to parse seven_day reset time:', sevenDayResetAt);
      }
    }

    // Use utilization percentages directly from API
    const sessionPercent = fiveHourUtilization !== null ? fiveHourUtilization : 0;
    const weeklyPercent = sevenDayUtilization !== null ? sevenDayUtilization : 0;

    // Calculate estimated used/limit values for display
    // These are estimates since API only gives percentages
    const tierLimits: Record<string, { session: number; weekly: number }> = {
      free: { session: 10, weekly: 50 },
      pro: { session: 45, weekly: 500 },
      max5: { session: 225, weekly: 2500 },
      max20: { session: 900, weekly: 10000 },
      unknown: { session: 45, weekly: 500 },
    };

    const limits = tierLimits[tier] || tierLimits.unknown;
    const sessionLimit = limits.session;
    const weeklyLimit = limits.weekly;

    // Estimate used based on percentage
    const sessionUsed = Math.round((sessionPercent / 100) * sessionLimit);
    const weeklyUsed = Math.round((weeklyPercent / 100) * weeklyLimit);

    console.log('Parsed usage:', {
      tier,
      fiveHourUtilization,
      sevenDayUtilization,
      sessionPercent,
      weeklyPercent,
      sessionResetAt: finalSessionResetAt,
      weeklyResetAt: finalWeeklyResetAt,
    });

    return {
      sessionUsage: {
        used: sessionUsed,
        limit: sessionLimit,
        percentUsed: sessionPercent,
        resetAt: finalSessionResetAt,
      },
      weeklyUsage: {
        used: weeklyUsed,
        limit: weeklyLimit,
        percentUsed: weeklyPercent,
        resetAt: finalWeeklyResetAt,
      },
      subscriptionTier: tier,
      lastUpdated: now,
    };
  }

  /**
   * Calculate next session reset time (5-hour window)
   */
  private calculateSessionReset(): string {
    const now = new Date();
    const msIn5Hours = 5 * 60 * 60 * 1000;

    // Calculate next 5-hour boundary
    const epoch = new Date('2024-01-01T00:00:00Z').getTime();
    const timeSinceEpoch = now.getTime() - epoch;
    const currentWindow = Math.floor(timeSinceEpoch / msIn5Hours);
    const nextReset = new Date(epoch + (currentWindow + 1) * msIn5Hours);

    return nextReset.toISOString();
  }

  /**
   * Calculate next weekly reset time (Sunday)
   */
  private calculateWeeklyReset(): string {
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0 = Sunday
    const daysUntilSunday = dayOfWeek === 0 ? 7 : 7 - dayOfWeek;

    const nextSunday = new Date(now);
    nextSunday.setDate(now.getDate() + daysUntilSunday);
    nextSunday.setHours(11, 0, 0, 0); // 11:00 AM

    return nextSunday.toISOString();
  }

  /**
   * Update poll interval based on current usage
   */
  private updatePollInterval(): void {
    if (!this.pollInterval || !this.isPolling) return;

    // Restart polling with new interval
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
