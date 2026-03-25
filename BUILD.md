# Building NordPool Monitor Electron App

Complete guide for building the professional Windows installer.

## 🚀 Quick Build

```bash
# 1. Install dependencies
npm install

# 2. Build Windows installer
npm run build:win

# 3. Find installer
ls dist/
# → NordPool Monitor Setup 5.13.3.exe
```

## 📋 Prerequisites

### **Required:**
- Node.js 16+ ([Download](https://nodejs.org))
- npm 8+
- Windows 10/11 for building Windows installer

### **Recommended:**
- 4GB RAM minimum
- 2GB free disk space
- Good internet connection (first build downloads Electron binaries)

## 🔨 Build Commands

### **Development:**
```bash
# Run app in development mode
npm start

# Run with DevTools open
npm run dev
```

### **Production Builds:**
```bash
# Windows installer only
npm run build:win

# Mac installer
npm run build:mac

# Linux installer  
npm run build:linux

# All platforms
npm run build

# Build without publishing
npm run dist
```

## 📦 Output Files

After `npm run build:win`:

```
dist/
├── NordPool Monitor Setup 5.13.3.exe   (~80 MB installer)
└── win-unpacked/                      (unpacked files)
    └── NordPool Monitor.exe           (portable exe)
```

## 🎯 What the Installer Does

1. **Installs to:**
   - Default: `C:\Program Files\NordPool Monitor\`
   - User can change during install

2. **Creates:**
   - Desktop shortcut (optional)
   - Start menu entry
   - Uninstaller

3. **Includes:**
   - Electron runtime
   - Chromium engine
   - All app files
   - Node.js runtime
   
   **Total installed size:** ~150 MB

## 🔧 Customization

### **Change App Name:**
Edit `package.json`:
```json
{
  "name": "my-app-name",
  "productName": "My App Name"
}
```

### **Change Version:**
```json
{
  "version": "6.0.0"
}
```

### **Change Icon:**
Replace files in `build/` directory:
- `icon.ico` (Windows)
- `icon.icns` (Mac)
- `icon.png` (Linux)

Icon requirements:
- Windows: 256x256 .ico
- Mac: 512x512 .icns
- Linux: 512x512 .png

### **Installer Options:**
Edit `package.json` → `build.nsis`:
```json
{
  "oneClick": false,              // Allow install dir selection
  "allowToChangeInstallationDirectory": true,
  "createDesktopShortcut": true,
  "createStartMenuShortcut": true
}
```

## 🐛 Troubleshooting

### **Build Fails - No Icon:**
Icon files are missing. Either:
1. Create placeholder icons
2. Or remove icon references from `package.json`

### **Build Fails - ENOENT:**
```bash
# Clean and rebuild
rm -rf node_modules dist
npm install
npm run build:win
```

### **Build Takes Forever:**
First build downloads Electron binaries (~200MB). Subsequent builds are faster.

### **"Cannot find module":**
```bash
npm install --save-dev electron electron-builder
```

### **NSIS Error (Windows):**
Ensure you're on Windows to build Windows installer, or use GitHub Actions / CI for cross-platform builds.

## 📊 Build Performance

| Build Type | Time | Output Size |
|------------|------|-------------|
| First build | 5-10 min | ~80 MB |
| Incremental | 1-2 min | ~80 MB |
| Development (npm start) | 5 sec | N/A |

## 🚢 Distribution

### **Option 1: Direct Download**
1. Upload `NordPool Monitor Setup 5.13.3.exe` to file host
2. Share download link
3. Users run installer

### **Option 2: GitHub Releases**
```bash
# Tag release
git tag v5.13.3
git push --tags

# Upload to GitHub Releases
gh release create v5.13.3 dist/*.exe
```

### **Option 3: Auto-Update**
Implement electron-updater:
```bash
npm install electron-updater
```

Configure in `main.js`:
```javascript
const { autoUpdater } = require('electron-updater');
autoUpdater.checkForUpdatesAndNotify();
```

## 🔒 Code Signing (Optional)

### **Why Sign?**
- Removes "Unknown Publisher" warning
- Users trust signed apps more
- Required for auto-updates

### **How to Sign:**
```bash
# Install windows-sign-tool
npm install --save-dev electron-builder-windows-sign

# Get code signing certificate
# (Purchase from DigiCert, Sectigo, etc.)

# Configure in package.json
{
  "build": {
    "win": {
      "certificateFile": "path/to/cert.p12",
      "certificatePassword": "password"
    }
  }
}
```

## 📱 Building for Other Platforms

### **On Mac (to build Mac app):**
```bash
npm run build:mac
# → dist/NordPool Monitor-5.13.3.dmg
```

### **On Linux (to build Linux app):**
```bash
npm run build:linux
# → dist/NordPool Monitor-5.13.3.AppImage
```

### **Cross-Platform Build (Advanced):**
Use GitHub Actions or Docker for building all platforms from one machine.

## ✅ Pre-Release Checklist

Before distributing:

- [ ] Test on clean Windows machine
- [ ] Verify all features work
- [ ] Check notification permissions
- [ ] Test uninstaller
- [ ] Verify auto-start (if enabled)
- [ ] Test system tray functionality
- [ ] Check for memory leaks (Task Manager)
- [ ] Scan with antivirus (avoid false positives)
- [ ] Update version number
- [ ] Update CHANGELOG
- [ ] Create GitHub release

## 🎉 Success!

After building, you'll have a professional Windows installer that:
- ✅ Installs like any professional app
- ✅ No manual file management
- ✅ Clean uninstallation
- ✅ Desktop & Start menu shortcuts
- ✅ System tray integration
- ✅ Background notifications
- ✅ Auto-start capability

Ready to distribute to users! 🚀

---

**Questions?** Check the main README or open an issue on GitHub.
