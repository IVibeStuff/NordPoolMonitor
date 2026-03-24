# NordPool Monitor - Electron Edition

Professional desktop application for monitoring Nord Pool electricity prices.

## 🚀 Features

### **Core Features**
- ✅ Real-time electricity prices (15-minute segments)
- ✅ Multi-country support (Estonia, Finland, Latvia, Lithuania)
- ✅ 48-hour centered price chart
- ✅ Smart cost calculator
- ✅ Beautiful Design 3 interface

### **Desktop Features**
- ✅ System tray integration
- ✅ **Background price monitoring**
- ✅ **Configurable Low & High Price Alerts**
- ✅ **Configurable electricity fees with day/night network rates and VAT**
- ✅ Auto-start capability
- ✅ Runs in background (even when window closed)
- ✅ Professional installer
- ✅ One-click installation
- ✅ **Dark mode** (toggle in Settings)
- ✅ **Chart zoom** — scroll to zoom, drag to pan, double-click or button to reset
- ✅ **Auto-update** — automatically checks for new versions and notifies via tray
- ✅ **Customizable Cost Calculator** — add your own appliances with power rating and duration; costs persist across restarts

### **Smart Alerts** 🔔
- **Low Price Alert** — notifies when price enters the lowest 25%; toggleable in Settings (default: on)
- **High Price Alert** — notifies when price enters the highest 25%; toggleable in Settings (default: off)
- Each alert fires **once** per price period and resets when the price moves out of that range
- Auto-dismisses after 8 seconds
- Works even when app is minimized to tray

## 📦 Installation

### **For End Users:**

1. Download `NordPool-Monitor-Setup-5.9.0.exe`
2. Run the installer
3. Follow installation wizard
4. Launch from desktop shortcut or Start menu
5. App runs in system tray

> **Windows SmartScreen warning?** This app is not code-signed, so Windows may show a "Windows protected your PC" prompt when running the installer. This is expected — the app is safe to install.
> 1. Click **"More info"**
> 2. Click **"Run anyway"**
>
> The same applies when installing an update downloaded through the app.

### **For Developers:**

```bash
# Install dependencies
npm install

# Run in development mode
npm start

# Build installer
npm run build:win
```

## 🎮 Usage

### **First Run:**
- App opens automatically after installation
- Appears in system tray (lightning bolt icon ⚡)
- Select your country (Estonia/Finland/Latvia/Lithuania)
- Notifications work automatically

### **Daily Use:**
- **System Tray Icon:**
  - Left click: Show/hide window
  - Right click: Context menu
  - Shows current price in tooltip

- **Window:**
  - View detailed prices and charts
  - Switch countries
  - Check cost calculator
  - Close button minimizes to tray

- **Notifications:**
  - Appear automatically when price is low
  - Click to open app window
  - Auto-dismiss after 8 seconds

### **Auto-Start (Optional):**
To run on Windows startup:
1. Right-click app in system tray
2. Settings → Enable auto-start

## 🔧 Configuration

### **Country Selection:**
- Click country buttons in header
- Selection is saved automatically
- Persists across restarts

### **Notification Settings:**
- **Low Price Alert** — notifies when electricity price is at its lowest; toggle on/off in Settings (default: on)
- **High Price Alert** — notifies when electricity price is at its highest; toggle on/off in Settings (default: off)
- Each alert fires once per price period and resets when the price moves out of that range
- Windows notification settings apply

## 📊 Technical Details

### **Architecture:**
- **Frontend:** Vanilla JavaScript + Chart.js
- **Backend:** Electron (Node.js)
- **API:** Elering Dashboard API (free)
- **Storage:** electron-store (persistent settings)
- **Notifications:** Native OS notifications

### **System Requirements:**
- **OS:** Windows 10/11 (x64)
- **RAM:** 80-120 MB
- **Disk:** ~150 MB
- **Network:** Internet connection required

### **Data Source:**
- API: `https://dashboard.elering.ee/api/nps/price`
- Free, no API key required
- 15-minute price resolution
- Historical + forecast data

### **Background Monitoring:**
- Checks prices every 15 minutes
- Runs even when window closed
- Low CPU usage (~0.1%)
- Minimal battery impact
