const { app, BrowserWindow, Tray, Menu, nativeImage, Notification, ipcMain } = require('electron');
const path = require('path');
const Store = require('electron-store');
const axios = require('axios');

// Store for persistent settings
const store = new Store();

let mainWindow = null;
let settingsWindow = null;
let tray = null;
let priceCheckInterval = null;
let currentPriceLevel = 'moderate'; // 'low', 'moderate', 'high'

// Notification state
let notificationState = {
  isInLowPeriod: false,
  hasNotifiedThisPeriod: false,
  lastNotificationTime: null
};

// Create colored icon using raw pixel data (most reliable on Windows)
function createColoredIconPNG(colorHex) {
  // Convert hex to RGB
  const r = parseInt(colorHex.slice(1, 3), 16);
  const g = parseInt(colorHex.slice(3, 5), 16);
  const b = parseInt(colorHex.slice(5, 7), 16);
  
  // Create 32x32 PNG manually
  const size = 32;
  const buffer = Buffer.alloc(size * size * 4);
  
  // Simple circle with lightning effect
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - size / 2;
      const dy = y - size / 2;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const idx = (y * size + x) * 4;
      
      // Draw circle
      if (distance < size / 2 - 1) {
        buffer[idx] = r;     // R
        buffer[idx + 1] = g; // G
        buffer[idx + 2] = b; // B
        buffer[idx + 3] = 255; // A
        
        // Lightning bolt pattern (simple white pixels in center)
        const isLightning = 
          (x >= size / 2 - 2 && x <= size / 2 + 2 && y >= size / 4 && y <= 3 * size / 4) ||
          (x >= size / 2 - 4 && x <= size / 2 && y >= size / 2 - 2 && y <= size / 2 + 2) ||
          (x >= size / 2 && x <= size / 2 + 4 && y >= size / 2 + 2 && y <= size / 2 + 6);
        
        if (isLightning) {
          buffer[idx] = 255;     // White
          buffer[idx + 1] = 255;
          buffer[idx + 2] = 255;
        }
      } else {
        // Transparent outside circle
        buffer[idx] = 0;
        buffer[idx + 1] = 0;
        buffer[idx + 2] = 0;
        buffer[idx + 3] = 0;
      }
    }
  }
  
  return nativeImage.createFromBuffer(buffer, {
    width: size,
    height: size
  });
}

// Get icon color based on price level
function getIconColor(priceLevel) {
  switch(priceLevel) {
    case 'low': return '#10b981';      // Green
    case 'high': return '#ef4444';     // Red  
    default: return '#f59e0b';         // Yellow (moderate)
  }
}

// Create icon with current price level - ALWAYS use dynamic colored icons
function createIcon(priceLevel) {
  const color = getIconColor(priceLevel);
  console.log(`Creating DYNAMIC colored icon: ${color} for level: ${priceLevel}`);
  
  // ALWAYS create dynamic colored icon - never use static file
  return createColoredIconPNG(color);
}

// Update tray icon with current price level
function updateTrayIcon(priceLevel) {
  if (!tray) {
    console.warn('⚠ Tray is null, cannot update icon');
    return;
  }
  
  try {
    const icon = createIcon(priceLevel);
    const resized = icon.resize({ width: 16, height: 16 });
    tray.setImage(resized);
    console.log(`✓ Tray icon updated to ${priceLevel}`);
  } catch (error) {
    console.error('❌ Failed to update tray icon:', error.message);
  }
}

// Update window icon
function updateWindowIcon(priceLevel) {
  if (!mainWindow) {
    console.warn('⚠ Window is null, cannot update icon');
    return;
  }
  
  try {
    const icon = createIcon(priceLevel);
    mainWindow.setIcon(icon);
    console.log(`✓ Window icon updated to ${priceLevel}`);
    
    // Try to set taskbar overlay on Windows
    if (process.platform === 'win32') {
      try {
        const overlayIcon = icon.resize({ width: 16, height: 16 });
        const description = `${priceLevel} price`;
        mainWindow.setOverlayIcon(overlayIcon, description);
        console.log(`✓ Taskbar overlay updated to ${priceLevel}`);
      } catch (overlayError) {
        console.warn('⚠ Could not set taskbar overlay:', overlayError.message);
      }
    }
  } catch (error) {
    console.error('❌ Failed to update window icon:', error.message);
  }
}

// Update all icons
function updateAllIcons(priceLevel) {
  console.log(`\n=== UPDATING ALL ICONS TO: ${priceLevel} ===`);
  currentPriceLevel = priceLevel;
  updateTrayIcon(priceLevel);
  updateWindowIcon(priceLevel);
  console.log(`=== ICON UPDATE COMPLETE ===\n`);
}

// Create main window
function createWindow() {
  console.log('Creating main window...');
  
  const startIcon = createIcon('moderate'); // Yellow by default
  
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 1100,
    minWidth: 1000,
    minHeight: 850,
    icon: startIcon,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    show: false,
    backgroundColor: '#fafaf9',
    autoHideMenuBar: true
  });

  // Remove menu bar completely
  mainWindow.setMenuBarVisibility(false);
  mainWindow.setMenu(null);

  mainWindow.loadFile(path.join(__dirname, 'renderer/index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    console.log('✓ Window shown');
  });

  // Minimize to tray instead of closing
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      console.log('Window minimized to tray');
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Create settings window
function createSettingsWindow() {
  if (settingsWindow) {
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 500,
    height: 610,
    resizable: false,
    parent: mainWindow,
    modal: true,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  settingsWindow.setMenuBarVisibility(false);
  settingsWindow.setMenu(null);

  // Create settings HTML
  const darkModeEnabled = store.get('darkMode', false);
  const settingsHTML = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Settings - NordPool Monitor</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #fafaf9;
      color: #292524;
      padding: 24px;
      overflow: hidden;
    }
    h1 {
      font-size: 24px;
      font-weight: 300;
      margin-bottom: 20px;
      letter-spacing: -0.5px;
    }
    .setting-group {
      background: white;
      border: 1px solid #e7e5e4;
      border-radius: 12px;
      padding: 16px;
      margin-bottom: 12px;
    }
    .setting-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 0;
    }
    .setting-label {
      font-size: 15px;
      color: #292524;
    }
    .setting-desc {
      font-size: 13px;
      color: #78716c;
      margin-top: 4px;
    }
    .toggle {
      position: relative;
      width: 48px;
      height: 28px;
      flex-shrink: 0;
      background: #d1d5db;
      border-radius: 14px;
      cursor: pointer;
      transition: background 0.2s;
    }
    .toggle.active {
      background: #10b981;
    }
    .toggle::after {
      content: '';
      position: absolute;
      top: 2px;
      left: 2px;
      width: 24px;
      height: 24px;
      background: white;
      border-radius: 12px;
      transition: left 0.2s;
    }
    .toggle.active::after {
      left: 22px;
    }
    button {
      background: #292524;
      color: white;
      border: none;
      padding: 10px 20px;
      border-radius: 8px;
      cursor: pointer;
      font-size: 14px;
      margin-top: 16px;
    }
    button:hover {
      background: #44403c;
    }

    /* Dark Mode */
    body.dark {
      background: #1c1917;
      color: #f5f5f4;
    }
    body.dark .setting-group {
      background: #292524;
      border-color: #44403c;
    }
    body.dark .setting-label {
      color: #f5f5f4;
    }
    body.dark .setting-desc {
      color: #a8a29e;
    }
    body.dark button {
      background: #44403c;
    }
    body.dark button:hover {
      background: #57534e;
    }
  </style>
</head>
<body class="${darkModeEnabled ? 'dark' : ''}">
  <h1>Settings</h1>

  <div class="setting-group">
    <div class="setting-row">
      <div>
        <div class="setting-label">Launch at Startup</div>
        <div class="setting-desc">Start NordPool Monitor when Windows starts</div>
      </div>
      <div class="toggle" id="autostart-toggle" onclick="toggleAutoStart()"></div>
    </div>
  </div>

  <div class="setting-group">
    <div class="setting-row">
      <div>
        <div class="setting-label">Background Monitoring</div>
        <div class="setting-desc">Check prices every 15 minutes (always enabled)</div>
      </div>
      <div class="toggle active"></div>
    </div>
  </div>

  <div class="setting-group">
    <div class="setting-row">
      <div>
        <div class="setting-label">Notifications</div>
        <div class="setting-desc">Alert when price is in lowest 33% (always enabled)</div>
      </div>
      <div class="toggle active"></div>
    </div>
  </div>

  <div class="setting-group">
    <div class="setting-row">
      <div>
        <div class="setting-label">Dark Mode</div>
        <div class="setting-desc">Switch the main window to a dark colour scheme</div>
      </div>
      <div class="toggle ${darkModeEnabled ? 'active' : ''}" id="darkmode-toggle" onclick="toggleDarkMode()"></div>
    </div>
  </div>

  <button onclick="closeSettings()">Close</button>

  <script>
    // Check current auto-start setting
    const autoStartEnabled = localStorage.getItem('autostart') === 'true';
    const autostartToggle = document.getElementById('autostart-toggle');
    if (autoStartEnabled) {
      autostartToggle.classList.add('active');
    }

    function toggleAutoStart() {
      const toggle = document.getElementById('autostart-toggle');
      const enabled = !toggle.classList.contains('active');
      toggle.classList.toggle('active');
      localStorage.setItem('autostart', enabled);
      if (window.electronAPI && window.electronAPI.setAutoStart) {
        window.electronAPI.setAutoStart(enabled);
      }
    }

    function toggleDarkMode() {
      const toggle = document.getElementById('darkmode-toggle');
      const enabled = !toggle.classList.contains('active');
      toggle.classList.toggle('active');
      document.body.classList.toggle('dark', enabled);
      if (window.electronAPI && window.electronAPI.setDarkMode) {
        window.electronAPI.setDarkMode(enabled);
      }
    }

    function closeSettings() {
      window.close();
    }
  </script>
</body>
</html>
  `;

  settingsWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(settingsHTML));

  settingsWindow.once('ready-to-show', () => {
    settingsWindow.show();
  });

  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
}

// Create system tray
function createTray() {
  console.log('\n=== CREATING SYSTEM TRAY ===');
  
  try {
    // Create icon
    const icon = createIcon('moderate');
    console.log('Icon created, size:', icon.getSize());
    
    // Resize for tray (16x16 is standard for Windows)
    const trayIcon = icon.resize({ width: 16, height: 16 });
    console.log('Icon resized for tray:', trayIcon.getSize());
    
    // Create tray
    tray = new Tray(trayIcon);
    console.log('✓ Tray object created');
    
    // Set tooltip immediately
    tray.setToolTip('NordPool Monitor - Loading...');
    console.log('✓ Tray tooltip set');
    
    // Build context menu
    updateTrayMenu();
    console.log('✓ Tray menu created');
    
    // Click handler
    tray.on('click', () => {
      console.log('Tray icon clicked');
      if (mainWindow) {
        if (mainWindow.isVisible()) {
          mainWindow.hide();
          console.log('Window hidden');
        } else {
          mainWindow.show();
          mainWindow.focus();
          console.log('Window shown and focused');
        }
      }
    });
    
    console.log('✓ TRAY CREATED SUCCESSFULLY');
    console.log('=== END TRAY CREATION ===\n');
    
  } catch (error) {
    console.error('❌ FAILED TO CREATE TRAY:', error);
    console.error('Error stack:', error.stack);
  }
}

// Update tray context menu
function updateTrayMenu(currentPrice = null, priceLevel = 'moderate') {
  const contextMenu = Menu.buildFromTemplate([
    {
      label: `NordPool Monitor v${app.getVersion()}`,
      enabled: false
    },
    { type: 'separator' },
    {
      label: currentPrice ? `Current: ${currentPrice}` : 'Loading...',
      enabled: false
    },
    {
      label: priceLevel === 'low' ? '🟢 Low Price' : 
             priceLevel === 'high' ? '🔴 High Price' : '🟡 Moderate Price',
      enabled: false
    },
    { type: 'separator' },
    {
      label: 'Show Window',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    },
    {
      label: 'Settings',
      click: () => {
        createSettingsWindow();
      }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.isQuitting = true;
        app.quit();
      }
    }
  ]);
  
  tray.setContextMenu(contextMenu);
}

// Fetch prices from Elering API
async function fetchPrices(country = 'ee') {
  try {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 2);
    const startDate = new Date(today.getTime() - (24 * 60 * 60 * 1000));
    const endDate = new Date(tomorrow.getTime());
    
    const start = startDate.toISOString().split('.')[0] + '.000Z';
    const end = endDate.toISOString().split('.')[0] + '.999Z';
    
    const response = await axios.get('https://dashboard.elering.ee/api/nps/price', {
      params: { start, end },
      timeout: 15000
    });
    
    if (response.data && response.data.data && response.data.data[country]) {
      return processPriceData(response.data.data[country], country);
    }
    
    return null;
  } catch (error) {
    console.error('Error fetching prices:', error.message);
    return null;
  }
}

// Process price data
function processPriceData(rawData, country) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  const prices = rawData
    .map(item => ({
      timestamp: new Date(item.timestamp * 1000),
      price: item.price / 10,
      pricePerKwh: item.price / 10
    }))
    .sort((a, b) => a.timestamp - b.timestamp);
  
  // Only today's prices for calculating thresholds
  const todayPrices = prices.filter(p => 
    p.timestamp >= today && p.timestamp < tomorrow
  );
  
  // Find current price
  const currentHour = now.getHours();
  const currentSegmentMinute = Math.floor(now.getMinutes() / 15) * 15;
  
  const currentPrice = prices.find(p => 
    p.timestamp.getHours() === currentHour &&
    p.timestamp.getMinutes() === currentSegmentMinute &&
    p.timestamp.getDate() === now.getDate()
  );
  
  // Calculate statistics (33rd and 66th percentile)
  const priceValues = todayPrices.map(p => p.price).sort((a, b) => a - b);
  const q33Index = Math.floor(priceValues.length * 0.33);
  const q66Index = Math.floor(priceValues.length * 0.66);
  const q33 = priceValues[q33Index];
  const q66 = priceValues[q66Index];
  
  // Determine price level
  let priceLevel = 'moderate';
  if (currentPrice) {
    if (currentPrice.price <= q33) {
      priceLevel = 'low';
    } else if (currentPrice.price >= q66) {
      priceLevel = 'high';
    }
  }
  
  return {
    current: currentPrice,
    thresholdLow: q33,
    thresholdHigh: q66,
    priceLevel: priceLevel,
    prices: prices,
    currency: country === 'fi' ? 'c' : 's'
  };
}

// Check price and show notification if needed
async function checkPriceAlert() {
  const country = store.get('country', 'ee');
  const data = await fetchPrices(country);
  
  if (!data || !data.current) {
    console.log('No price data available');
    return;
  }
  
  const currentPrice = data.current.pricePerKwh;
  const priceLevel = data.priceLevel;
  
  console.log(`Price check: ${currentPrice.toFixed(2)} ${data.currency}/kWh - Level: ${priceLevel}`);
  console.log(`Thresholds: Low ≤ ${data.thresholdLow.toFixed(2)}, High ≥ ${data.thresholdHigh.toFixed(2)}`);
  
  // Update all icons with current price level
  console.log(`Updating icons to: ${priceLevel}`);
  updateAllIcons(priceLevel);
  
  // Update tray menu and tooltip
  const priceDisplay = `${currentPrice.toFixed(2)} ${data.currency}/kWh`;
  updateTrayMenu(priceDisplay, priceLevel);
  
  if (tray) {
    tray.setToolTip(`NordPool Monitor - ${priceDisplay} (${priceLevel})`);
    console.log(`✓ Tray tooltip updated: ${priceDisplay}`);
  } else {
    console.warn('⚠ Tray is null, cannot update tooltip');
  }
  
  // Notification logic
  const isLowPrice = priceLevel === 'low';
  
  // Price is low and entering new low period
  if (isLowPrice && !notificationState.isInLowPeriod) {
    notificationState.isInLowPeriod = true;
    notificationState.hasNotifiedThisPeriod = false;
    console.log('→ Entered low price period');
  }
  
  // Price went back up - reset
  if (!isLowPrice && notificationState.isInLowPeriod) {
    notificationState.isInLowPeriod = false;
    notificationState.hasNotifiedThisPeriod = false;
    console.log('→ Left low price period - reset notification flag');
  }
  
  // Show notification
  if (isLowPrice && notificationState.isInLowPeriod && !notificationState.hasNotifiedThisPeriod) {
    showNotification(data);
    notificationState.hasNotifiedThisPeriod = true;
    notificationState.lastNotificationTime = new Date();
  }
}

// Show native notification
function showNotification(data) {
  const price = data.current.pricePerKwh.toFixed(2);
  const currency = data.currency;
  
  const notification = new Notification({
    title: '⚡ Energy Price Alert',
    body: `Price now LOW: ${price} ${currency}/kWh\nGood time to use appliances!\n(Lowest 33% today)`,
    silent: false,
    timeoutType: 'default',
    icon: createIcon('low')
  });
  
  notification.show();
  
  notification.on('click', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
  
  console.log('✓ Notification sent');
}

// Start background price monitoring
function startPriceMonitoring() {
  // Check immediately
  checkPriceAlert();
  
  // Then check every 15 minutes
  priceCheckInterval = setInterval(() => {
    checkPriceAlert();
  }, 15 * 60 * 1000);
}

// Handle auto-start setting
ipcMain.on('set-autostart', (event, enabled) => {
  app.setLoginItemSettings({
    openAtLogin: enabled,
    name: 'NordPool Monitor'
  });
  store.set('autostart', enabled);
  console.log(`Auto-start ${enabled ? 'enabled' : 'disabled'}`);
});

// Return current dark mode state
ipcMain.handle('get-dark-mode', () => store.get('darkMode', false));

// Handle dark mode setting
ipcMain.on('set-dark-mode', (event, enabled) => {
  store.set('darkMode', enabled);
  if (mainWindow) {
    mainWindow.webContents.send('dark-mode-changed', enabled);
  }
  console.log(`Dark mode ${enabled ? 'enabled' : 'disabled'}`);
});

// App ready
app.whenReady().then(() => {
  createWindow();
  createTray();
  startPriceMonitoring();
  
  // Set auto-start if previously enabled
  const autoStart = store.get('autostart', false);
  if (autoStart) {
    app.setLoginItemSettings({
      openAtLogin: true,
      name: 'NordPool Monitor'
    });
  }
});

// Quit when all windows closed (except on macOS)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    // Don't quit - keep running in tray
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Cleanup on quit
app.on('before-quit', () => {
  if (priceCheckInterval) {
    clearInterval(priceCheckInterval);
  }
});
