import { useMemo } from 'react';
import { differenceInMinutes, differenceInHours } from 'date-fns';
import './UsageCard.css';

interface UsageInfo {
  used: number;
  limit: number;
  percentUsed: number;
  resetAt: string;
}

interface UsageCardProps {
  title: string;
  usage: UsageInfo;
  variant: 'session' | 'weekly';
}

export function UsageCard({ title, usage, variant }: UsageCardProps) {
  const { percentUsed, resetAt } = usage;

  const status = useMemo(() => {
    if (percentUsed >= 90) return 'critical';
    if (percentUsed >= 75) return 'warning';
    return 'good';
  }, [percentUsed]);

  const resetTime = useMemo(() => {
    try {
      const resetDate = new Date(resetAt);
      const now = new Date();

      // If reset is in the past, show "Now"
      if (resetDate <= now) {
        return 'Now';
      }

      const hours = differenceInHours(resetDate, now);
      const minutes = differenceInMinutes(resetDate, now) % 60;

      if (hours > 24) {
        const days = Math.floor(hours / 24);
        const remainingHours = hours % 24;
        return `${days}d ${remainingHours}h`;
      }

      if (hours > 0) {
        return `${hours}h ${minutes}m`;
      }

      return `${minutes}m`;
    } catch {
      return '--';
    }
  }, [resetAt]);

  // Circular progress calculation
  // Radius = 40, so circumference = 2 * PI * 40
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentUsed / 100) * circumference;

  const statusLabel = useMemo(() => {
    if (status === 'critical') return 'Critical';
    if (status === 'warning') return 'Warning';
    return 'OK';
  }, [status]);

  return (
    <div className={`usage-card ${variant} ${status}`}>
      <div className="card-header">
        <h3>{title}</h3>
        <span className={`status-badge ${status}`}>
          {statusLabel}
        </span>
      </div>

      <div className="card-content">
        <div className="circular-progress">
          <svg viewBox="0 0 100 100">
            {/* Background circle */}
            <circle
              className="progress-bg"
              cx="50"
              cy="50"
              r={radius}
              fill="none"
              strokeWidth="7"
            />
            {/* Progress circle */}
            <circle
              className={`progress-fill ${status}`}
              cx="50"
              cy="50"
              r={radius}
              fill="none"
              strokeWidth="7"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              style={{
                transformOrigin: 'center',
              }}
            />
          </svg>
          <div className="progress-text">
            <span className="percent-value">{percentUsed}</span>
            <span className="percent-sign">%</span>
          </div>
        </div>

        <div className="usage-details">
          <div className="reset-info">
            <span className="reset-label">Resets in</span>
            <span className="reset-value">{resetTime}</span>
          </div>

          <div className="usage-bar">
            <div
              className={`usage-bar-fill ${status}`}
              style={{ width: `${Math.min(percentUsed, 100)}%` }}
            />
          </div>

          <div className="usage-stats">
            {usage.used} / {usage.limit} messages
          </div>
        </div>
      </div>
    </div>
  );
}
