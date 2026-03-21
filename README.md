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
- ✅ **Native Windows notifications**
- ✅ Auto-start capability
- ✅ Runs in background (even when window closed)
- ✅ Professional installer
- ✅ One-click installation
- ✅ **Dark mode** (toggle in Settings)
- ✅ **Chart zoom** — scroll to zoom, drag to pan, double-click or button to reset

### **Smart Alerts** 🔔
- Automatic notification when price enters lowest 25%
- Notification appears **once** per low-price period
- Auto-dismisses after 8 seconds
- Resets when price goes up
- Works even when app is minimized to tray

## 📦 Installation

### **For End Users:**

1. Download `NordPool-Monitor-Setup-5.5.1.exe`
2. Run the installer
3. Follow installation wizard
4. Launch from desktop shortcut or Start menu
5. App runs in system tray

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
- Notifications appear when price ≤ 25th percentile
- Cannot be disabled (core feature)
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
