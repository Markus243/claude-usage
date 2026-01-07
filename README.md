# Claude Usage Tracker

Desktop app for tracking Claude AI subscription usage limits.

<img width="599" height="647" alt="Screenshot 2026-01-07 132344" src="https://github.com/user-attachments/assets/69ebbd30-0c68-48e2-85d2-962163511927" />

<img width="593" height="644" alt="Screenshot 2026-01-07 134536" src="https://github.com/user-attachments/assets/d80369f2-3d2a-4dba-8f85-a3fb5de01344" />

---
<a href="https://buymeacoffee.com/markusjmul6" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" style="height: 60px !important;width: 217px !important;" ></a>

## Features

- Real-time usage tracking
- System tray integration with visual indicators
- Secure authentication management
- Usage notifications

## Installation

Download the latest installer from the releases page (or build it from source).

1. Run the `Claude Usage Tracker-Windows-Setup.exe` installer.
2. The application will launch automatically.
3. Look for the Claude logo in your system tray (bottom right corner).
4. Click the icon to open the dashboard and log in with your Claude.ai account.

## Development

### Prerequisites

- Node.js (Latest LTS version recommended)
- npm

### Installation

1. Clone the repository
2. Install dependencies:

```bash
npm install
```

### Running in Development Mode

Starts the Vite dev server and Electron app:

```bash
npm run dev
```

## Build

To build the application and create an installer for your operating system:

```bash
npm run build
```

The output will be generated in the `release` directory:

- Windows: `release/{version}/Claude Usage Tracker-Windows-{version}-Setup.exe`
- Mac/Linux: Corresponding artifacts in `release/{version}/`

## Project Structure

- `electron/`: Main process code
- `src/`: Renderer process (React) code
- `dist/`: Built renderer assets
- `dist-electron/`: Built main process assets
- `release/`: Packaged application installers
