# Claude Usage Tracker

Desktop app for tracking Claude AI subscription usage limits.

## Features

- Real-time usage tracking
- System tray integration with visual indicators
- Secure authentication management
- Usage notifications

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
