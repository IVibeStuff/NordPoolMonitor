# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Install dependencies
npm install

# Run the app
npm start

# Build Windows installer
npm run build:win
```

There are no tests or linting configured.

## Architecture

This is an **Electron desktop app** for monitoring NordPool electricity prices. It follows standard Electron main/renderer process separation.

### Process structure

**`main.js`** — Main process. Owns:
- `BrowserWindow` (main window) and settings window (created inline as a `data:` URL HTML string)
- System tray icon with dynamic color (green/yellow/red based on price level)
- Background price polling every 15 minutes via `axios` directly (no CORS restrictions in Electron)
- Persistent settings via `electron-store` (`autostart`, `darkMode`)
- IPC handlers: `set-autostart`, `set-dark-mode`, `get-dark-mode`

**`preload.js`** — Exposes a minimal `window.electronAPI` bridge to the renderer via `contextBridge`: `setAutoStart`, `setDarkMode`, `getDarkMode`, `onDarkModeChange`.

**`renderer/index.html`** — Single-page UI with all CSS inline in `<head>`. Uses CSS custom properties (`--bg-primary`, `--bg-card`, etc.) for theming; dark mode is applied via `body.dark` class which overrides those variables.

**`renderer/api.js`** — `NordPoolAPI` class. Fetches from `https://dashboard.elering.ee/api/nps/price` covering yesterday/today/tomorrow. Processes raw data into price points with `color` and `zone` properties (green/yellow/red based on today+tomorrow Q1/Q3 percentiles). Has a 1-hour in-memory cache.

**`renderer/renderer.js`** — Drives all UI updates. Key globals: `currentCountry`, `isDarkMode`, `lastData` (cached last fetch result), `priceChart` (Chart.js instance). On dark mode change, re-renders the chart using `lastData` without a new API call.

### Settings window

The settings window HTML is **embedded as a template literal string inside `main.js`** (`createSettingsWindow()`). The current `darkMode` state from `electron-store` is interpolated directly into the HTML at window creation time so the toggle renders in the correct initial state.

### Dark mode flow

1. Settings toggle → `window.electronAPI.setDarkMode(enabled)` → IPC `set-dark-mode`
2. `main.js` saves to `electron-store`, sends `dark-mode-changed` to `mainWindow.webContents`
3. `renderer.js` `onDarkModeChange` callback: updates `isDarkMode`, toggles `body.dark`, saves to `localStorage`, re-renders chart
4. On startup, `renderer.js` `init()` calls `getDarkMode()` IPC to get the authoritative state from `electron-store`

### Data flow

- Prices are fetched in `renderer/api.js` and cached there
- `renderer.js` calls `api.fetchPrices(country, forceRefresh)` and saves result to `lastData`
- The 48-hour chart shows 96 segments before and after the current segment (centered), with the current bar rendered white (dark mode) or black (light mode)
- Country selection and dark mode preference are persisted to `localStorage` in the renderer; dark mode is also persisted to `electron-store` in the main process (authoritative source)

### Tray icon

The tray icon is generated programmatically as raw pixel data (32×32 PNG buffer) — no static image files. Color reflects current price level: green (low), yellow (moderate), red (high). Version is shown in the tray context menu via `app.getVersion()` (reads from `package.json`).
