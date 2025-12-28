# Claude Usage Tracker - Implementation Plan

## Overview

Build an Electron desktop app for Windows that displays Claude subscription usage (5-hour session and weekly limits) with a system tray widget, modern UI, and configurable alerts.

## Key Decisions

- **Authentication**: Embedded WebView login to claude.ai (auto-capture session cookie)
- **Platform**: Windows only (initially)
- **Tray Display**: Icon with percentage badge + hover tooltip with progress bars
- **Alerts**: Configurable threshold notifications (50%, 75%, 90%, etc.)

---

## Architecture

```
MAIN PROCESS (electron/)
├── TrayManager      - System tray icon, tooltip, context menu
├── AuthService      - WebView login, cookie capture, session management
├── UsageService     - API polling, data fetching, caching
├── NotificationSvc  - Threshold alerts, native Windows notifications
└── SecureStore      - Encrypted credential & settings storage

     ↕ IPC (contextBridge)

RENDERER PROCESS (src/)
├── Dashboard Page   - Usage cards, progress bars, countdown timers
├── Settings Page    - Threshold config, preferences
├── Login Page       - Embedded WebView for claude.ai login
└── Zustand Stores   - usageStore, authStore, settingsStore
```

---

## Authentication Flow

1. User clicks "Login" → Main process opens BrowserWindow to `https://claude.ai/login`
2. User completes login on claude.ai
3. On navigation to `/chat` or dashboard, extract `sessionKey` cookie (starts with `sk-ant-sid01-`)
4. Store encrypted cookie via electron-store + Windows DPAPI
5. Close login window, emit success to renderer

---

## Usage Data

### Data Structure
```typescript
interface ClaudeUsageData {
  sessionUsage: {
    percentUsed: number;  // 0-100
    resetAt: string;      // ISO timestamp (5-hour window)
  };
  weeklyUsage: {
    percentUsed: number;
    resetAt: string;
  };
  subscriptionTier: 'pro' | 'max' | 'free';
}
```

### Polling Strategy
- Default: Poll every 60 seconds
- When >80% usage: Poll every 30 seconds
- Handle 401 by triggering re-authentication

---

## System Tray

### Icon
- 16x16 base icon with color-coded badge (green/yellow/red)
- Badge shows session usage percentage

### Tooltip (on hover)
```
Claude Usage Tracker
────────────────────
Session (5hr): 45%
[████████░░░░░░░░░░]

Weekly: 23%
[████░░░░░░░░░░░░░░]

Resets: 2h 15m | 4d 3h
```

### Context Menu
- Open Dashboard
- Session Usage: XX%
- Weekly Usage: XX%
- Refresh Now
- Settings
- Logout
- Quit

---

## Notifications

### Default Thresholds
| Type | Percentage | Sound |
|------|------------|-------|
| Session | 50% | No |
| Session | 75% | Yes |
| Session | 90% | Yes |
| Weekly | 75% | No |
| Weekly | 90% | Yes |

All thresholds are user-configurable in Settings.

---

## File Structure

```
claude-ai-usage/
├── electron/
│   ├── main.ts                    # Entry, window management
│   ├── preload.ts                 # IPC bridge
│   ├── services/
│   │   ├── AuthService.ts
│   │   ├── UsageService.ts
│   │   └── NotificationService.ts
│   ├── tray/
│   │   ├── TrayManager.ts
│   │   └── TrayIconGenerator.ts
│   ├── storage/
│   │   └── SecureStore.ts
│   └── ipc/
│       ├── handlers.ts
│       └── channels.ts
├── src/
│   ├── pages/
│   │   ├── Dashboard/
│   │   ├── Settings/
│   │   └── Login/
│   ├── components/
│   │   ├── common/               # Button, Card, ProgressBar, etc.
│   │   └── usage/                # UsageCard, ResetCountdown
│   ├── stores/
│   │   ├── usageStore.ts
│   │   ├── authStore.ts
│   │   └── settingsStore.ts
│   └── hooks/
│       └── useIPC.ts
└── assets/
    ├── icons/
    │   └── app-icon.ico
    └── sounds/
        └── alert.wav
```

---

## Dependencies to Add

```json
{
  "dependencies": {
    "react-router-dom": "^6.22.0",
    "zustand": "^4.5.0",
    "electron-store": "^8.2.0",
    "sharp": "^0.33.0",
    "date-fns": "^3.3.0"
  }
}
```

---

## Implementation Phases

### Phase 1: Core Infrastructure
- [ ] Create folder structure
- [ ] Add dependencies
- [ ] Implement SecureStore with electron-store
- [ ] Set up IPC channels and typed handlers
- [ ] Create Zustand stores (auth, settings, usage)

### Phase 2: Authentication
- [ ] Implement AuthService with WebView login
- [ ] Cookie capture logic for sessionKey
- [ ] Session persistence and validation
- [ ] Create Login page UI

### Phase 3: Usage Data Fetching
- [ ] Implement UsageService with polling
- [ ] API endpoint integration (unofficial claude.ai endpoints)
- [ ] Error handling and retry logic
- [ ] Create Dashboard UI with usage cards

### Phase 4: System Tray
- [ ] TrayIconGenerator with dynamic badges
- [ ] TrayManager with context menu
- [ ] Tooltip with usage details
- [ ] Minimize to tray behavior

### Phase 5: Notifications
- [ ] NotificationService with threshold checking
- [ ] Native Windows notifications
- [ ] Settings page for threshold configuration
- [ ] Alert sound support

### Phase 6: Polish & UI Design
- [ ] Apply modern UI design (frontend-design skill)
- [ ] Dark/light theme support
- [ ] Animations and transitions
- [ ] Error states and offline handling

### Phase 7 (Bonus): Admin API Integration
- [ ] Organization API usage tracking
- [ ] Admin API key configuration
- [ ] Token/cost breakdown display

---

## Critical Files to Modify

| File | Changes |
|------|---------|
| `electron/main.ts` | Add tray, auth windows, service initialization |
| `electron/preload.ts` | Expand IPC API (auth, usage, settings, notifications) |
| `src/App.tsx` | Add routing, global state providers |
| `package.json` | Add new dependencies |
| `electron-builder.json5` | Update app ID, product name, icons |

---

## Technical Notes

### Security
- Use `safeStorage` (Windows DPAPI) for credential encryption
- Disable `nodeIntegration`, enable `contextIsolation`
- Never log session cookies

### Windows-Specific
- App icon: `.ico` format (16x16, 32x32, 48x48, 256x256)
- Tray icons: 16x16 or 32x32 pixels
- Test with light and dark taskbar themes

### Performance
- Debounce tray icon updates
- Cache rendered icons
- Minimize main process blocking
