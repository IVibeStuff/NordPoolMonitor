const { app, BrowserWindow, Tray, Menu, nativeImage, Notification, ipcMain, shell } = require('electron');
const path = require('path');
const zlib = require('zlib');
const Store = require('electron-store');
const axios = require('axios');
const { autoUpdater } = require('electron-updater');
const { createColoredIcon } = require('./icon-generator');

// Store for persistent settings
const store = new Store();

let mainWindow = null;
let settingsWindow = null;
let tray = null;
let priceCheckInterval = null;
let currentPriceLevel = 'moderate'; // 'low', 'moderate', 'high'


// Update state
let updateState = {
  available: false,
  downloaded: false,
  version: null
};

// Configure auto updater
autoUpdater.autoDownload = false;
autoUpdater.allowPrerelease = false;

autoUpdater.on('checking-for-update', () => {
  console.log('Checking for update...');
});

autoUpdater.on('update-not-available', () => {
  console.log('No update available.');
});

autoUpdater.on('download-progress', (progress) => {
  const percent = Math.round(progress.percent);
  console.log(`Download progress: ${percent}%`);
  if (tray) tray.setToolTip(`NordPool Monitor - Downloading update: ${percent}%`);
  if (mainWindow) mainWindow.webContents.send('update-status', { state: 'downloading', percent });
});

autoUpdater.on('update-available', (info) => {
  updateState.available = true;
  updateState.version = info.version;
  console.log(`Update available: v${info.version}`);
  updateTrayMenu();
  if (mainWindow) mainWindow.webContents.send('update-status', { state: 'available', version: info.version });

  new Notification({
    title: 'NordPool Monitor — Update Available',
    body: `Version ${info.version} is available. Click the update button in the app to download.`,
    silent: false
  }).show();
});

autoUpdater.on('update-downloaded', () => {
  updateState.downloaded = true;
  console.log('Update downloaded, ready to install');
  updateTrayMenu();
  if (mainWindow) mainWindow.webContents.send('update-status', { state: 'downloaded' });

  new Notification({
    title: 'NordPool Monitor — Update Ready',
    body: 'Update downloaded and ready to install. Open the app window to apply it.'
  }).show();
});

autoUpdater.on('error', (err) => {
  console.warn('Auto-updater error:', err.message);
  new Notification({
    title: 'NordPool Monitor — Update Error',
    body: err.message,
    silent: true
  }).show();
});

// Encode raw RGBA buffer as a valid PNG using zlib
function rgbaToPNG(rgba, width, height) {
  const crcTable = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    crcTable[i] = c;
  }
  function crc32(buf) {
    let crc = 0xFFFFFFFF;
    for (const byte of buf) crc = crcTable[(crc ^ byte) & 0xFF] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }
  function chunk(type, data) {
    const t = Buffer.from(type);
    const lenBuf = Buffer.alloc(4); lenBuf.writeUInt32BE(data.length);
    const crcBuf = Buffer.alloc(4); crcBuf.writeUInt32BE(crc32(Buffer.concat([t, data])));
    return Buffer.concat([lenBuf, t, data, crcBuf]);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    raw[y * (1 + width * 4)] = 0; // filter: none
    rgba.copy(raw, y * (1 + width * 4) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

// Create colored icon with lightning bolt
function createColoredIconPNG(colorHex) {
  const r = parseInt(colorHex.slice(1, 3), 16);
  const g = parseInt(colorHex.slice(3, 5), 16);
  const b = parseInt(colorHex.slice(5, 7), 16);
  const size = 32;
  const rgba = Buffer.alloc(size * size * 4);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - size / 2;
      const dy = y - size / 2;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const idx = (y * size + x) * 4;
      if (distance < size / 2 - 1) {
        rgba[idx] = r; rgba[idx + 1] = g; rgba[idx + 2] = b; rgba[idx + 3] = 255;
        const isLightning =
          (x >= size / 2 - 2 && x <= size / 2 + 2 && y >= size / 4 && y <= 3 * size / 4) ||
          (x >= size / 2 - 4 && x <= size / 2 && y >= size / 2 - 2 && y <= size / 2 + 2) ||
          (x >= size / 2 && x <= size / 2 + 4 && y >= size / 2 + 2 && y <= size / 2 + 6);
        if (isLightning) { rgba[idx] = 255; rgba[idx + 1] = 255; rgba[idx + 2] = 255; }
      } else {
        rgba[idx + 3] = 0; // transparent
      }
    }
  }

  return nativeImage.createFromBuffer(rgbaToPNG(rgba, size, size));
}

// Create colored tray icon based on price level
function createIcon(priceLevel = 'moderate') {
  const colors = { low: '#22c55e', moderate: '#f59e0b', high: '#ef4444' };
  const color = colors[priceLevel] || colors.moderate;
  try {
    return createColoredIcon(color, 32);
  } catch (e) {
    return createColoredIconPNG(color);
  }
}

// Update tray icon to reflect current price level
function updateAllIcons(priceLevel) {
  currentPriceLevel = priceLevel;
  if (tray) {
    tray.setImage(createIcon(priceLevel).resize({ width: 16, height: 16 }));
  }
}

// Create main window
function createWindow() {
  console.log('Creating main window...');

  const startIcon = nativeImage.createFromPath(path.join(__dirname, 'build', 'icon.ico'));
  
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 1150,
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
    height: 980,
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
  const autoStartEnabled = store.get('autostart', false);
  const lowPriceAlertEnabled = store.get('lowPriceAlert', true);
  const highPriceAlertEnabled = store.get('highPriceAlert', false);
  const networkFeeDay = store.get('networkFeeDay', 0);
  const networkFeeNight = store.get('networkFeeNight', 0);
  const energyTax = store.get('energyTax', 0);
  const supplierMargin = store.get('supplierMargin', 0);
  const renewableFee = store.get('renewableFee', 0);
  const balancingFee = store.get('balancingFee', 0);
  const includeVat = store.get('includeVat', false);
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
    .fee-input {
      width: 110px;
      padding: 6px 8px;
      border: 1px solid #e7e5e4;
      border-radius: 8px;
      font-size: 14px;
      text-align: right;
      background: #f5f5f4;
      color: #292524;
      flex-shrink: 0;
    }
    .fee-input::-webkit-inner-spin-button,
    .fee-input::-webkit-outer-spin-button {
      -webkit-appearance: none;
      margin: 0;
    }
    body.dark .fee-input {
      background: #1c1917;
      border-color: #44403c;
      color: #f5f5f4;
    }
    .fee-group-title {
      font-size: 15px;
      color: #292524;
      margin-bottom: 4px;
    }
    .fee-group-desc {
      font-size: 13px;
      color: #78716c;
      margin-bottom: 12px;
    }
    body.dark .fee-group-title { color: #f5f5f4; }
    body.dark .fee-group-desc { color: #a8a29e; }
    .fee-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 6px 0;
      border-top: 1px solid #f5f5f4;
    }
    body.dark .fee-row { border-top-color: #44403c; }
    .fee-row-label {
      font-size: 13px;
      color: #292524;
    }
    body.dark .fee-row-label { color: #d6d3d1; }
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
      <div class="toggle ${autoStartEnabled ? 'active' : ''}" id="autostart-toggle" onclick="toggleAutoStart()"></div>
    </div>
  </div>

  <div class="setting-group">
    <div class="setting-row">
      <div>
        <div class="setting-label">Low Price Alert</div>
        <div class="setting-desc">Notify when electricity price is at its lowest</div>
      </div>
      <div class="toggle ${lowPriceAlertEnabled ? 'active' : ''}" id="lowprice-toggle" onclick="toggleLowPriceAlert()"></div>
    </div>
  </div>

  <div class="setting-group">
    <div class="setting-row">
      <div>
        <div class="setting-label">High Price Alert</div>
        <div class="setting-desc">Notify when electricity price is at its highest</div>
      </div>
      <div class="toggle ${highPriceAlertEnabled ? 'active' : ''}" id="highprice-toggle" onclick="toggleHighPriceAlert()"></div>
    </div>
  </div>

  <div class="setting-group">
    <div class="fee-group-title">Electricity Fees</div>
    <div class="fee-group-desc">Added to spot price in the Cost Calculator</div>
    <div class="fee-row">
      <div class="fee-row-label">Network fee - day 07:00–22:00 (s/kWh)</div>
      <input type="text" class="fee-input" id="network-fee-day" min="0" step="0.01" value="${networkFeeDay}" onfocus="feeInputFocus(this)" onblur="feeInputBlur(this, updateNetworkFeeDay)" onchange="updateNetworkFeeDay(this.value)" />
    </div>
    <div class="fee-row">
      <div class="fee-row-label">Network fee - night 22:00–07:00 (s/kWh)</div>
      <input type="text" class="fee-input" id="network-fee-night" min="0" step="0.01" value="${networkFeeNight}" onfocus="feeInputFocus(this)" onblur="feeInputBlur(this, updateNetworkFeeNight)" onchange="updateNetworkFeeNight(this.value)" />
    </div>
    <div class="fee-row">
      <div class="fee-row-label">Energy tax (s/kWh)</div>
      <input type="text" class="fee-input" id="energy-tax" min="0" step="0.01" value="${energyTax}" onfocus="feeInputFocus(this)" onblur="feeInputBlur(this, updateEnergyTax)" onchange="updateEnergyTax(this.value)" />
    </div>
    <div class="fee-row">
      <div class="fee-row-label">Security of supply fee (s/kWh)</div>
      <input type="text" class="fee-input" id="supplier-margin" min="0" step="0.01" value="${supplierMargin}" onfocus="feeInputFocus(this)" onblur="feeInputBlur(this, updateSupplierMargin)" onchange="updateSupplierMargin(this.value)" />
    </div>
    <div class="fee-row">
      <div class="fee-row-label">Renewable energy fee (s/kWh)</div>
      <input type="text" class="fee-input" id="renewable-fee" min="0" step="0.01" value="${renewableFee}" onfocus="feeInputFocus(this)" onblur="feeInputBlur(this, updateRenewableFee)" onchange="updateRenewableFee(this.value)" />
    </div>
    <div class="fee-row">
      <div class="fee-row-label">Balancing capacity fee (s/kWh)</div>
      <input type="text" class="fee-input" id="balancing-fee" min="0" step="0.01" value="${balancingFee}" onfocus="feeInputFocus(this)" onblur="feeInputBlur(this, updateBalancingFee)" onchange="updateBalancingFee(this.value)" />
    </div>
    <div class="fee-row">
      <div class="fee-row-label">Include VAT (24%)</div>
      <div class="toggle ${includeVat ? 'active' : ''}" id="vat-toggle" onclick="toggleVat()"></div>
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
    function toggleAutoStart() {
      const toggle = document.getElementById('autostart-toggle');
      const enabled = !toggle.classList.contains('active');
      toggle.classList.toggle('active');
      if (window.electronAPI && window.electronAPI.setAutoStart) {
        window.electronAPI.setAutoStart(enabled);
      }
    }

    function toggleLowPriceAlert() {
      const toggle = document.getElementById('lowprice-toggle');
      const enabled = !toggle.classList.contains('active');
      toggle.classList.toggle('active');
      if (window.electronAPI && window.electronAPI.setLowPriceAlert) {
        window.electronAPI.setLowPriceAlert(enabled);
      }
    }

    function toggleHighPriceAlert() {
      const toggle = document.getElementById('highprice-toggle');
      const enabled = !toggle.classList.contains('active');
      toggle.classList.toggle('active');
      if (window.electronAPI && window.electronAPI.setHighPriceAlert) {
        window.electronAPI.setHighPriceAlert(enabled);
      }
    }

    function parseFee(value) {
      return parseFloat(String(value).replace(',', '.')) || 0;
    }
    function feeInputFocus(el) {
      if (el.value === '0') el.value = '';
    }
    function feeInputBlur(el, updateFn) {
      if (el.value === '') {
        el.value = '0';
        updateFn('0');
      } else {
        const normalized = String(el.value).replace(',', '.');
        el.value = normalized;
        updateFn(normalized);
      }
    }

    function updateNetworkFeeDay(value) {
      if (window.electronAPI && window.electronAPI.setNetworkFeeDay)
        window.electronAPI.setNetworkFeeDay(parseFee(value));
    }
    function updateNetworkFeeNight(value) {
      if (window.electronAPI && window.electronAPI.setNetworkFeeNight)
        window.electronAPI.setNetworkFeeNight(parseFee(value));
    }
    function updateEnergyTax(value) {
      if (window.electronAPI && window.electronAPI.setEnergyTax)
        window.electronAPI.setEnergyTax(parseFee(value));
    }
    function updateSupplierMargin(value) {
      if (window.electronAPI && window.electronAPI.setSupplierMargin)
        window.electronAPI.setSupplierMargin(parseFee(value));
    }
    function updateRenewableFee(value) {
      if (window.electronAPI && window.electronAPI.setRenewableFee)
        window.electronAPI.setRenewableFee(parseFee(value));
    }
    function updateBalancingFee(value) {
      if (window.electronAPI && window.electronAPI.setBalancingFee)
        window.electronAPI.setBalancingFee(parseFee(value));
    }
    function toggleVat() {
      const toggle = document.getElementById('vat-toggle');
      const enabled = !toggle.classList.contains('active');
      toggle.classList.toggle('active');
      if (window.electronAPI && window.electronAPI.setIncludeVat)
        window.electronAPI.setIncludeVat(enabled);
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
    // Create tray (resize to 16x16 for Windows system tray)
    const trayIcon = createIcon(currentPriceLevel).resize({ width: 16, height: 16 });
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

// Return fee settings
ipcMain.handle('get-fee-settings', () => ({
  networkFeeDay: store.get('networkFeeDay', 0),
  networkFeeNight: store.get('networkFeeNight', 0),
  energyTax: store.get('energyTax', 0),
  supplierMargin: store.get('supplierMargin', 0),
  renewableFee: store.get('renewableFee', 0),
  balancingFee: store.get('balancingFee', 0),
  includeVat: store.get('includeVat', false)
}));

const broadcastFeeSettings = () => {
  if (mainWindow) {
    mainWindow.webContents.send('fee-settings-changed', {
      networkFeeDay: store.get('networkFeeDay', 0),
      networkFeeNight: store.get('networkFeeNight', 0),
      energyTax: store.get('energyTax', 0),
      supplierMargin: store.get('supplierMargin', 0),
      renewableFee: store.get('renewableFee', 0),
      balancingFee: store.get('balancingFee', 0),
      includeVat: store.get('includeVat', false)
    });
  }
};

ipcMain.on('set-network-fee-day', (event, fee) => { store.set('networkFeeDay', fee); broadcastFeeSettings(); });
ipcMain.on('set-network-fee-night', (event, fee) => { store.set('networkFeeNight', fee); broadcastFeeSettings(); });
ipcMain.on('set-energy-tax', (event, fee) => { store.set('energyTax', fee); broadcastFeeSettings(); });
ipcMain.on('set-supplier-margin', (event, fee) => { store.set('supplierMargin', fee); broadcastFeeSettings(); });
ipcMain.on('set-renewable-fee', (event, fee) => { store.set('renewableFee', fee); broadcastFeeSettings(); });
ipcMain.on('set-balancing-fee', (event, fee) => { store.set('balancingFee', fee); broadcastFeeSettings(); });
ipcMain.on('set-include-vat', (event, enabled) => { store.set('includeVat', enabled); broadcastFeeSettings(); });

ipcMain.handle('get-custom-appliances', () => store.get('customAppliances', []));
ipcMain.handle('set-custom-appliances', (_, appliances) => { store.set('customAppliances', appliances); });
ipcMain.on('open-settings', () => { createSettingsWindow(); });
ipcMain.on('download-update', () => { autoUpdater.downloadUpdate(); });
ipcMain.on('restart-to-update', () => { app.isQuitting = true; autoUpdater.quitAndInstall(); });
ipcMain.handle('get-hidden-builtins', () => store.get('hiddenBuiltins', []));
ipcMain.handle('set-hidden-builtins', (_, ids) => { store.set('hiddenBuiltins', ids); });

// Return current alert settings
ipcMain.handle('get-alert-settings', () => ({
  lowPriceAlert: store.get('lowPriceAlert', true),
  highPriceAlert: store.get('highPriceAlert', false)
}));

// Handle low price alert setting
ipcMain.on('set-low-price-alert', (event, enabled) => {
  store.set('lowPriceAlert', enabled);
  if (mainWindow) {
    mainWindow.webContents.send('alert-settings-changed', {
      lowPriceAlert: enabled,
      highPriceAlert: store.get('highPriceAlert', false)
    });
  }
});

// Handle high price alert setting
ipcMain.on('set-high-price-alert', (event, enabled) => {
  store.set('highPriceAlert', enabled);
  if (mainWindow) {
    mainWindow.webContents.send('alert-settings-changed', {
      lowPriceAlert: store.get('lowPriceAlert', true),
      highPriceAlert: enabled
    });
  }
});

// Handle dark mode setting
ipcMain.on('update-tray-price', (event, priceDisplay, priceLevel) => {
  updateAllIcons(priceLevel);
  updateTrayMenu(priceDisplay, priceLevel);
  if (tray) tray.setToolTip(`NordPool Monitor - ${priceDisplay}`);
});

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

  // Check for updates on startup and then every 24 hours (only in production)
  if (app.isPackaged) {
    setTimeout(() => autoUpdater.checkForUpdates(), 5000);
    setInterval(() => autoUpdater.checkForUpdates(), 24 * 60 * 60 * 1000);
  }
  
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
