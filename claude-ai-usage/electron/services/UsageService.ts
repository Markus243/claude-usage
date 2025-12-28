import { EventEmitter } from 'events';
const { net } = require('electron');
import { getStore } from '../storage/SecureStore';
import { getAuthService } from './AuthService';
import { UsageData } from '../ipc/types';

// Claude.ai API endpoints (unofficial - may change)
const BOOTSTRAP_API_URL = 'https://claude.ai/api/bootstrap';

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
    // First, try to get bootstrap data which contains usage info
    const response = await this.makeRequest(BOOTSTRAP_API_URL, sessionKey);

    if (!response.ok) {
      const error = new Error(`API request failed: ${response.status}`);
      (error as any).status = response.status;
      throw error;
    }

    const data = await response.json();
    return this.parseUsageResponse(data);
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
  private parseUsageResponse(data: any): UsageData {
    // Log the full raw response for debugging
    console.log('Claude API full response:', JSON.stringify(data, null, 2));

    const now = new Date().toISOString();

    // Initialize variables
    let sessionRemaining: number | null = null;
    let sessionResetAt: string | null = null;
    let tier: UsageData['subscriptionTier'] = 'unknown';

    // Claude's bootstrap API structure - check all known paths
    // The API may return data at different levels depending on the endpoint version

    // Check for messageLimit at root level (common structure)
    if (data.messageLimit) {
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

    // Detect subscription tier from various paths
    const account = data.account || {};

    // Check memberships array (Claude often uses this structure)
    if (data.account?.memberships && Array.isArray(data.account.memberships)) {
      const activeMembership = data.account.memberships.find((m: any) => m.status === 'active')
                              || data.account.memberships[0];
      if (activeMembership) {
        console.log('Found membership:', activeMembership);
        const offerType = activeMembership.offer_type || activeMembership.offerType || '';
        if (offerType.includes('max_20') || offerType.includes('max20')) tier = 'max20';
        else if (offerType.includes('max') || offerType.includes('team')) tier = 'max5';
        else if (offerType.includes('pro') || offerType.includes('plus') || offerType.includes('claude_pro')) tier = 'pro';
        else if (offerType.includes('free')) tier = 'free';
        else if (activeMembership.status === 'active') tier = 'pro';
      }
    }

    // Fallback tier detection
    if (tier === 'unknown') {
      const subscriptionInfo = account.subscription || data.subscription || {};
      const membershipInfo = account.membership || data.membership || {};
      const planType = subscriptionInfo.plan_type || subscriptionInfo.type || subscriptionInfo.offer_type ||
                       membershipInfo.plan_type || membershipInfo.type || membershipInfo.offer_type ||
                       account.plan_type || account.subscription_type || account.offer_type ||
                       data.plan_type || data.subscription_type || data.offer_type || '';

      const hasPaidSub = account.has_active_paid_subscription ||
                         data.has_active_paid_subscription ||
                         subscriptionInfo.active ||
                         (account.memberships && account.memberships.length > 0);

      if (planType) {
        const planLower = String(planType).toLowerCase();
        if (planLower.includes('max_20') || planLower.includes('max20')) tier = 'max20';
        else if (planLower.includes('max') || planLower.includes('team')) tier = 'max5';
        else if (planLower.includes('pro') || planLower.includes('plus') || planLower.includes('claude_pro')) tier = 'pro';
        else if (planLower.includes('free') || planLower === 'basic') tier = 'free';
        else if (hasPaidSub) tier = 'pro';
      } else if (hasPaidSub) {
        tier = 'pro';
      }
    }

    // Calculate limits based on tier
    const tierLimits: Record<string, { session: number; weekly: number }> = {
      free: { session: 10, weekly: 50 },
      pro: { session: 45, weekly: 500 },
      max5: { session: 225, weekly: 2500 },
      max20: { session: 900, weekly: 10000 },
      unknown: { session: 45, weekly: 500 },
    };

    const limits = tierLimits[tier] || tierLimits.unknown;
    let sessionLimit = limits.session;
    let sessionUsed = 0;

    // If we have remaining count, calculate used
    if (sessionRemaining !== null && sessionRemaining !== undefined) {
      // Handle case where remaining might be larger than our assumed limit
      if (sessionRemaining > sessionLimit) {
        sessionLimit = sessionRemaining; // Adjust limit to match
      }
      sessionUsed = Math.max(0, sessionLimit - sessionRemaining);
    }

    // Parse reset time
    let finalSessionResetAt = this.calculateSessionReset();
    if (sessionResetAt) {
      try {
        const resetDate = new Date(sessionResetAt);
        if (!isNaN(resetDate.getTime())) {
          finalSessionResetAt = resetDate.toISOString();
        }
      } catch (e) {
        console.log('Failed to parse reset time:', sessionResetAt);
      }
    }

    // Calculate percentages
    const sessionPercent = sessionLimit > 0
      ? Math.min(100, Math.round((sessionUsed / sessionLimit) * 100))
      : 0;

    // Weekly usage (estimate if not available)
    const usageBreakdown = data.usage || account.usage || {};
    const weeklyUsed = usageBreakdown.weekly_used ?? usageBreakdown.weeklyUsed ?? Math.round(sessionUsed * 2);
    const weeklyLimit = limits.weekly;
    const weeklyPercent = weeklyLimit > 0
      ? Math.min(100, Math.round((weeklyUsed / weeklyLimit) * 100))
      : 0;
    const weeklyResetAt = this.calculateWeeklyReset();

    console.log('Parsed usage:', {
      tier,
      sessionRemaining,
      sessionUsed,
      sessionLimit,
      sessionPercent,
      sessionResetAt: finalSessionResetAt,
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
        resetAt: weeklyResetAt,
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
