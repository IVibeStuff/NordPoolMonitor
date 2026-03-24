# F1 – Price Alerts Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans or superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fake Settings toggles with real Low Price Alert and High Price Alert toggles, each persisted in electron-store and wired end-to-end.

**Architecture:** IPC messages carry alert preferences from the Settings window → main process (electron-store) → renderer. The renderer reads preferences on init and subscribes to live changes. `checkPriceAlert()` gates both alert types on the stored preference.

**Tech Stack:** Electron (ipcMain/ipcRenderer/contextBridge), electron-store, Web Notifications API

---

## Files to Modify

- `main.js` — add IPC handlers, read alert prefs at settings window creation, update settings HTML
- `preload.js` — expose `setLowPriceAlert`, `setHighPriceAlert`, `getAlertSettings`, `onAlertSettingsChange`
- `renderer/renderer.js` — read prefs on init, subscribe to changes, update `checkPriceAlert` with high alert logic
- `README.md` — update Notification Settings section

---

### Task 1: Add IPC handlers in `main.js`

**Files:** Modify `main.js`

- [ ] **Step 1: Add IPC handler for `get-alert-settings`**

  After the existing `ipcMain.handle('get-dark-mode', ...)` at line 767, add:

  ```js
  ipcMain.handle('get-alert-settings', () => ({
    lowPriceAlert: store.get('lowPriceAlert', true),
    highPriceAlert: store.get('highPriceAlert', false)
  }));
  ```

- [ ] **Step 2: Add IPC handler for `set-low-price-alert`**

  After the handler above, add:

  ```js
  ipcMain.on('set-low-price-alert', (event, enabled) => {
    store.set('lowPriceAlert', enabled);
    if (mainWindow) {
      mainWindow.webContents.send('alert-settings-changed', {
        lowPriceAlert: enabled,
        highPriceAlert: store.get('highPriceAlert', false)
      });
    }
  });
  ```

- [ ] **Step 3: Add IPC handler for `set-high-price-alert`**

  After the handler above, add:

  ```js
  ipcMain.on('set-high-price-alert', (event, enabled) => {
    store.set('highPriceAlert', enabled);
    if (mainWindow) {
      mainWindow.webContents.send('alert-settings-changed', {
        lowPriceAlert: store.get('lowPriceAlert', true),
        highPriceAlert: enabled
      });
    }
  });
  ```

- [ ] **Step 4: Commit**

  ```bash
  git add main.js
  git commit -m "feat(F1): add IPC handlers for low/high price alert settings"
  ```

---

### Task 2: Update `preload.js`

**Files:** Modify `preload.js`

- [ ] **Step 1: Expose the four new API methods**

  Add to the `contextBridge.exposeInMainWorld('electronAPI', { ... })` object:

  ```js
  setLowPriceAlert: (enabled) => {
    ipcRenderer.send('set-low-price-alert', enabled);
  },
  setHighPriceAlert: (enabled) => {
    ipcRenderer.send('set-high-price-alert', enabled);
  },
  getAlertSettings: () => ipcRenderer.invoke('get-alert-settings'),
  onAlertSettingsChange: (callback) => {
    ipcRenderer.on('alert-settings-changed', (event, settings) => callback(settings));
  }
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add preload.js
  git commit -m "feat(F1): expose alert settings API in preload"
  ```

---

### Task 3: Update Settings window HTML in `main.js`

**Files:** Modify `main.js` — `createSettingsWindow()` function

- [ ] **Step 1: Read alert prefs alongside existing prefs**

  At line 278–279, after `const autoStartEnabled = store.get('autostart', false);`, add:

  ```js
  const lowPriceAlertEnabled = store.get('lowPriceAlert', true);
  const highPriceAlertEnabled = store.get('highPriceAlert', false);
  ```

- [ ] **Step 2: Replace the Background Monitoring setting group**

  Remove this block entirely (lines 400–408):

  ```html
  <div class="setting-group">
    <div class="setting-row">
      <div>
        <div class="setting-label">Background Monitoring</div>
        <div class="setting-desc">Check prices every 15 minutes (always enabled)</div>
      </div>
      <div class="toggle active"></div>
    </div>
  </div>
  ```

- [ ] **Step 3: Replace the Notifications setting group with two real toggles**

  Replace this block (lines 410–418):

  ```html
  <div class="setting-group">
    <div class="setting-row">
      <div>
        <div class="setting-label">Notifications</div>
        <div class="setting-desc">Alert when price is in lowest 33% (always enabled)</div>
      </div>
      <div class="toggle active"></div>
    </div>
  </div>
  ```

  With:

  ```html
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
  ```

- [ ] **Step 4: Add toggle functions to the settings `<script>` block**

  After the existing `toggleAutoStart()` function, add:

  ```js
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
  ```

- [ ] **Step 5: Manual verification**

  Run `npm start`. Open Settings. Verify:
  - "Background Monitoring" is gone
  - "Low Price Alert" toggle appears ON by default
  - "High Price Alert" toggle appears OFF by default
  - Toggling each one persists after closing and reopening Settings

- [ ] **Step 6: Commit**

  ```bash
  git add main.js
  git commit -m "feat(F1): update Settings UI - real low/high price alert toggles"
  ```

---

### Task 4: Update `renderer.js` — read prefs and add high alert logic

**Files:** Modify `renderer/renderer.js`

- [ ] **Step 1: Add alert preference state variables**

  After `let lastData = null;` (line 6), add:

  ```js
  let lowPriceAlertEnabled = true;
  let highPriceAlertEnabled = false;
  ```

- [ ] **Step 2: Expand `notificationState` with high price fields**

  Update the `notificationState` object (lines 9–13) to:

  ```js
  let notificationState = {
    isInLowPeriod: false,
    hasNotifiedThisPeriod: false,
    lastNotificationTime: null,
    isInHighPeriod: false,
    hasNotifiedThisHighPeriod: false
  };
  ```

- [ ] **Step 3: Load alert prefs on init**

  In the `init()` function (or wherever `getDarkMode()` is called on startup), add after the dark mode init:

  ```js
  if (window.electronAPI && window.electronAPI.getAlertSettings) {
    const alertSettings = await window.electronAPI.getAlertSettings();
    lowPriceAlertEnabled = alertSettings.lowPriceAlert;
    highPriceAlertEnabled = alertSettings.highPriceAlert;
  }
  ```

- [ ] **Step 4: Subscribe to live alert setting changes**

  Alongside the `onDarkModeChange` subscription, add:

  ```js
  if (window.electronAPI && window.electronAPI.onAlertSettingsChange) {
    window.electronAPI.onAlertSettingsChange((settings) => {
      lowPriceAlertEnabled = settings.lowPriceAlert;
      highPriceAlertEnabled = settings.highPriceAlert;
    });
  }
  ```

- [ ] **Step 5: Gate low price check on preference**

  In `checkPriceAlert(data)`, wrap the low price block so it only runs when enabled. Change the check at line 36:

  Find:
  ```js
  const isLowPrice = currentPrice <= threshold;
  ```

  After it, wrap all low-price logic in `if (lowPriceAlertEnabled) { ... }`. The full updated function body:

  ```js
  function checkPriceAlert(data) {
    if (!data.current || !data.stats) return;

    const currentPrice = data.current.pricePerKwh;

    // Low price alert
    if (lowPriceAlertEnabled) {
      const lowThreshold = data.stats.q1;
      const isLowPrice = currentPrice <= lowThreshold;

      if (isLowPrice && !notificationState.isInLowPeriod) {
        notificationState.isInLowPeriod = true;
        notificationState.hasNotifiedThisPeriod = false;
      }
      if (!isLowPrice && notificationState.isInLowPeriod) {
        notificationState.isInLowPeriod = false;
        notificationState.hasNotifiedThisPeriod = false;
      }
      if (isLowPrice && notificationState.isInLowPeriod && !notificationState.hasNotifiedThisPeriod) {
        showLowPriceNotification(data);
        notificationState.hasNotifiedThisPeriod = true;
        notificationState.lastNotificationTime = new Date();
      }
    }

    // High price alert
    if (highPriceAlertEnabled) {
      const highThreshold = data.stats.q3;
      const isHighPrice = currentPrice >= highThreshold;

      if (isHighPrice && !notificationState.isInHighPeriod) {
        notificationState.isInHighPeriod = true;
        notificationState.hasNotifiedThisHighPeriod = false;
      }
      if (!isHighPrice && notificationState.isInHighPeriod) {
        notificationState.isInHighPeriod = false;
        notificationState.hasNotifiedThisHighPeriod = false;
      }
      if (isHighPrice && notificationState.isInHighPeriod && !notificationState.hasNotifiedThisHighPeriod) {
        showHighPriceNotification(data);
        notificationState.hasNotifiedThisHighPeriod = true;
      }
    }
  }
  ```

- [ ] **Step 6: Rename `showPriceNotification` → `showLowPriceNotification`**

  Rename the existing function (line 72) from `showPriceNotification` to `showLowPriceNotification`. Update its call site in the old `checkPriceAlert` (now replaced above).

- [ ] **Step 7: Add `showHighPriceNotification` function**

  After `showLowPriceNotification`, add:

  ```js
  function showHighPriceNotification(data) {
    const price = data.current.pricePerKwh.toFixed(2);
    const currency = data.currency;

    const banner = document.getElementById('notification-banner');
    banner.textContent = `Heads up: price is HIGH right now (${price} ${currency}/kWh)`;
    banner.classList.remove('hidden');
    setTimeout(() => {
      banner.classList.add('hidden');
    }, 10000);

    if ('Notification' in window && Notification.permission === 'granted') {
      const notification = new Notification('⚡ Energy Price Alert', {
        body: `Price now HIGH: ${price} ${currency}/kWh\nConsider postponing high-energy tasks.`,
        icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">⚡</text></svg>',
        tag: 'price-alert-high',
        requireInteraction: false,
        silent: false
      });
      setTimeout(() => notification.close(), 8000);
      notification.onclick = function() {
        window.focus();
        notification.close();
      };
    }
  }
  ```

- [ ] **Step 8: Manual verification**

  Run `npm start`. Confirm:
  - Low Price Alert can be toggled off — no low-price notification fires
  - High Price Alert can be toggled on — high-price notification fires when appropriate
  - Both toggles persist after restart

- [ ] **Step 9: Commit**

  ```bash
  git add renderer/renderer.js
  git commit -m "feat(F1): wire low/high price alert prefs into renderer"
  ```

---

### Task 5: Update README

**Files:** Modify `README.md`

- [ ] **Step 1: Update Notification Settings section**

  Find (lines 99–102):

  ```markdown
  ### **Notification Settings:**
  - Notifications appear when price ≤ 25th percentile
  - Cannot be disabled (core feature)
  - Windows notification settings apply
  ```

  Replace with:

  ```markdown
  ### **Notification Settings:**
  - **Low Price Alert** — notifies when electricity price is at its lowest; toggle on/off in Settings (default: on)
  - **High Price Alert** — notifies when electricity price is at its highest; toggle on/off in Settings (default: off)
  - Each alert fires once per price period and resets when the price moves out of that range
  - Windows notification settings apply
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add README.md
  git commit -m "docs: update Notification Settings for configurable low/high price alerts"
  ```

---

### Task 6: Open PR

- [ ] **Step 1: Push branch and open PR**

  ```bash
  git push -u origin <branch-name>
  "/c/Program Files/GitHub CLI/gh.exe" pr create \
    --title "Add configurable Low/High Price Alert toggles in Settings" \
    --body "$(cat <<'EOF'
  ## Summary
  - Removes decorative "Background Monitoring" setting
  - Makes Low Price Alert toggleable (default ON)
  - Adds High Price Alert toggle (default OFF, fires at Q3 threshold)
  - Updates README Notification Settings section

  ## Test Plan
  - [ ] Low Price Alert toggle persists across Settings open/close
  - [ ] High Price Alert toggle persists across Settings open/close
  - [ ] Disabling Low Price Alert suppresses low-price notifications
  - [ ] Enabling High Price Alert fires notification when price is high

  🤖 Generated with [Claude Code](https://claude.com/claude-code)
  EOF
  )"
  ```
