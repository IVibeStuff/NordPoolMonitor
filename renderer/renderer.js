// Initialize API
const api = new NordPoolAPI();
let priceChart = null;
let currentCountry = 'ee'; // Default country
let isDarkMode = false;
let lastData = null;
let lowPriceAlertEnabled = true;
let highPriceAlertEnabled = false;
let feeSettings = { networkFeeDay: 0, networkFeeNight: 0, energyTax: 0, supplierMargin: 0, renewableFee: 0, balancingFee: 0, includeVat: false };

// Notification state tracking
let notificationState = {
  isInLowPeriod: false,
  hasNotifiedThisPeriod: false,
  lastNotificationTime: null,
  isInHighPeriod: false,
  hasNotifiedThisHighPeriod: false
};

// Request notification permission on load
async function requestNotificationPermission() {
  if ('Notification' in window) {
    if (Notification.permission === 'default') {
      console.log('Requesting notification permission...');
      const permission = await Notification.requestPermission();
      console.log(`Notification permission: ${permission}`);
    } else {
      console.log(`Notification permission already: ${Notification.permission}`);
    }
  } else {
    console.log('Notifications not supported in this browser');
  }
}

// Check price thresholds and show notifications based on user preferences
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

// Show low price notification
function showLowPriceNotification(data) {
  const price = data.current.pricePerKwh.toFixed(2);
  const currency = data.currency;
  
  // Show in-app banner
  const banner = document.getElementById('notification-banner');
  banner.textContent = `Good time to use energy! Price is ${price} ${currency}/kWh (lowest 25% today)`;
  banner.classList.remove('hidden');
  
  // Auto-hide banner after 10 seconds
  setTimeout(() => {
    banner.classList.add('hidden');
  }, 10000);
  
  // Show browser notification if permitted
  if ('Notification' in window && Notification.permission === 'granted') {
    const notification = new Notification('⚡ Energy Price Alert', {
      body: `Price now LOW: ${price} ${currency}/kWh\nGood time to use appliances!\n(Lowest 25% today)`,
      icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">⚡</text></svg>',
      tag: 'price-alert',
      requireInteraction: false,
      silent: false
    });
    
    // Auto-close after 8 seconds
    setTimeout(() => {
      notification.close();
    }, 8000);
    
    // Click to focus window
    notification.onclick = function() {
      window.focus();
      notification.close();
    };
    
    console.log('✓ Browser notification displayed');
  } else if (Notification.permission === 'denied') {
    console.warn('Notifications are blocked. Enable in browser settings.');
  } else {
    console.warn('Notification permission not granted');
  }
}

// Show high price notification
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

// Load and display electricity prices
async function loadPrices(forceRefresh = false) {
  try {
    showLoading(true);
    hideError();

    const data = await api.fetchPrices(currentCountry, forceRefresh);
    lastData = data;
    console.log('Price data loaded:', data);

    updateCurrentPrice(data);
    updateStats(data);
    updateRecommendations(data);
    updateCalculator(data);
    updateChart(data);
    updateLastUpdateTime(data.lastUpdate);
    updateCurrencySymbols(data.currency);
    updateCountryName(data.countryName);
    
    // Check for price alerts
    checkPriceAlert(data);

    showLoading(false);
  } catch (error) {
    console.error('Error loading prices:', error);
    showError('Failed to load electricity prices. Please check your internet connection and try again.');
    showLoading(false);
  }
}

// Update currency symbols throughout the UI
function updateCurrencySymbols(currency) {
  document.querySelectorAll('#currency-symbol, .curr-sym').forEach(el => {
    el.textContent = currency;
  });
}

// Update country name in footer
function updateCountryName(countryName) {
  document.getElementById('current-country').textContent = countryName;
}

// Update current price display
function updateCurrentPrice(data) {
  if (!data.current) {
    document.getElementById('current-price').textContent = '--';
    return;
  }

  const price = data.current.pricePerKwh.toFixed(2);
  const priceElement = document.getElementById('current-price');
  priceElement.textContent = price;

  // Apply color based on price zone
  priceElement.className = '';
  priceElement.classList.add(`price-${data.current.zone}`);

  // Update trend indicator
  const trendDiv = document.getElementById('trend-indicator');
  if (data.next) {
    const priceDiff = data.next.price - data.current.price;
    const percentChange = ((priceDiff / data.current.price) * 100).toFixed(1);
    
    let arrow = '';
    let trendText = '';

    if (priceDiff > 0.5) {
      arrow = '↑';
      trendText = `Price increasing by ${percentChange}% next segment`;
    } else if (priceDiff < -0.5) {
      arrow = '↓';
      trendText = `Price decreasing by ${Math.abs(percentChange)}% next segment`;
    } else {
      arrow = '→';
      trendText = 'Price stable next segment';
    }

    trendDiv.textContent = `${arrow} ${trendText}`;
  } else {
    trendDiv.textContent = 'Next segment price not yet available';
  }
}

// Update statistics
function updateStats(data) {
  if (!data.stats) return;

  document.getElementById('min-price').innerHTML = `${data.stats.min.toFixed(2)} <span class="price-unit" style="font-size: 14px;"><span class="curr-sym">${data.currency}</span></span>`;
  document.getElementById('avg-price').innerHTML = `${data.stats.average.toFixed(2)} <span class="price-unit" style="font-size: 14px;"><span class="curr-sym">${data.currency}</span></span>`;
  document.getElementById('max-price').innerHTML = `${data.stats.max.toFixed(2)} <span class="price-unit" style="font-size: 14px;"><span class="curr-sym">${data.currency}</span></span>`;
}

// Update recommendations
function updateRecommendations(data) {
  const cheapestHour = data.today.reduce((min, p) => p.price < min.price ? p : min, data.today[0]);
  const cheapestTime = formatTime(cheapestHour.timestamp);

  // Find 2-hour window with lowest average
  let bestWindow = null;
  let lowestAvg = Infinity;
  
  for (let i = 0; i < data.today.length - 7; i++) { // 8 segments = 2 hours
    const windowPrices = data.today.slice(i, i + 8);
    const avg = windowPrices.reduce((sum, p) => sum + p.price, 0) / windowPrices.length;
    if (avg < lowestAvg) {
      lowestAvg = avg;
      bestWindow = {
        start: windowPrices[0].timestamp,
        end: windowPrices[windowPrices.length - 1].timestamp
      };
    }
  }

  const bestWindowText = bestWindow 
    ? `${formatTime(bestWindow.start)}–${formatTime(bestWindow.end)}`
    : 'Not available';

  // Tomorrow outlook
  let tomorrowText = 'Not available yet';
  if (data.tomorrow.length > 0) {
    const todayAvg = data.stats.average;
    const tomorrowAvg = data.tomorrow.reduce((sum, p) => sum + p.price, 0) / data.tomorrow.length;
    const diff = ((tomorrowAvg - todayAvg) / todayAvg * 100);
    
    if (diff > 0) {
      tomorrowText = `${diff.toFixed(1)}% higher`;
    } else {
      tomorrowText = `${Math.abs(diff).toFixed(1)}% lower`;
    }
  }

  const recommendationsHTML = `
    <div class="recommendation-item">
      <div class="recommendation-title">Cheapest hour today</div>
      <div class="recommendation-time">${cheapestTime}</div>
    </div>
    <div class="recommendation-item">
      <div class="recommendation-title">Optimal appliance window</div>
      <div class="recommendation-time">${bestWindowText}</div>
    </div>
    <div class="recommendation-item">
      <div class="recommendation-title">Tomorrow's forecast</div>
      <div class="recommendation-time">${tomorrowText}</div>
    </div>
  `;

  document.getElementById('recommendations-content').innerHTML = recommendationsHTML;
}

// Helper function to format time
function formatTime(date) {
  const hours = date.getHours();
  const minutes = date.getMinutes();
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

// Calculate cost for appliance
function calculateCost(kw, durationMinutes, data) {
  const now = new Date();
  let totalCost = 0;
  let remainingMinutes = durationMinutes;
  
  // Find current segment
  let currentSegmentIndex = data.today.findIndex(p => {
    const pHour = p.timestamp.getHours();
    const pMinute = p.timestamp.getMinutes();
    const pDate = p.timestamp.getDate();
    const nowHour = now.getHours();
    const nowMinute = Math.floor(now.getMinutes() / 15) * 15;
    const nowDate = now.getDate();
    
    return pHour === nowHour && pMinute === nowMinute && pDate === nowDate;
  });

  if (currentSegmentIndex === -1) currentSegmentIndex = 0;

  const allPrices = [...data.today, ...(data.tomorrow || [])];
  
  while (remainingMinutes > 0 && currentSegmentIndex < allPrices.length) {
    const segment = allPrices[currentSegmentIndex];
    const segmentMinutes = Math.min(15, remainingMinutes);
    const segmentHours = segmentMinutes / 60;
    
    const { networkFeeDay, networkFeeNight, energyTax, supplierMargin, renewableFee, balancingFee, includeVat } = feeSettings;
    const hour = segment.timestamp.getHours();
    const networkFee = (hour >= 7 && hour < 22) ? networkFeeDay : networkFeeNight;
    const effectivePrice = (segment.pricePerKwh + networkFee + energyTax + supplierMargin + renewableFee + balancingFee) * (includeVat ? 1.24 : 1);
    totalCost += kw * segmentHours * effectivePrice;
    
    remainingMinutes -= segmentMinutes;
    currentSegmentIndex++;
  }
  
  return totalCost;
}

function formatCost(cost, currency) {
  if (cost >= 100) return `${(cost / 100).toFixed(2)}€`;
  return `${cost.toFixed(2)}${currency}`;
}

// Update calculator
function updateCalculator(data) {
  if (!data.current) return;

  // Typical power consumption values (in kW)
  const DISHWASHER_KW = 1.5;
  const BOILER_KW = 2.0;
  const WASHER_KW = 0.5;
  const HEATPUMP_25_KW = 2.5;
  const HEATPUMP_40_KW = 4.0;
  const GAMING_PC_KW = 0.75;

  // Calculate costs (only min and max for ranges)
  const dishwasherCost = calculateCost(DISHWASHER_KW, 60, data);
  const boiler40Cost = calculateCost(BOILER_KW, 60, data);  // 40L tank
  const boiler60Cost = calculateCost(BOILER_KW, 90, data);  // 60L tank
  const washerCost = calculateCost(WASHER_KW, 60, data);
  const heatpump25Cost = calculateCost(HEATPUMP_25_KW, 60, data);  // 2.5kW
  const heatpump40Cost = calculateCost(HEATPUMP_40_KW, 60, data);  // 4.0kW
  const gamingPCCost = calculateCost(GAMING_PC_KW, 60, data);

  // Update display (costs are already in cents/senti - don't multiply by 100!)
  const suffix = data.currency;
  document.getElementById('calc-dishwasher').textContent = formatCost(dishwasherCost, suffix);
  document.getElementById('calc-boiler-40').textContent = formatCost(boiler40Cost, suffix);
  document.getElementById('calc-boiler-60').textContent = formatCost(boiler60Cost, suffix);
  document.getElementById('calc-washer').textContent = formatCost(washerCost, suffix);
  document.getElementById('calc-heatpump-25').textContent = formatCost(heatpump25Cost, suffix);
  document.getElementById('calc-heatpump-40').textContent = formatCost(heatpump40Cost, suffix);
  document.getElementById('calc-gaming-pc').textContent = formatCost(gamingPCCost, suffix);
  updateCustomAppliances(data);
}

// Custom appliances — in-memory cache backed by electron-store
let _customAppliances = [];

async function initCustomAppliances() {
  if (window.electronAPI && window.electronAPI.getCustomAppliances) {
    _customAppliances = await window.electronAPI.getCustomAppliances();
  }
}

function loadCustomAppliances() {
  return _customAppliances;
}

function saveCustomAppliances(appliances) {
  _customAppliances = appliances;
  if (window.electronAPI && window.electronAPI.setCustomAppliances) {
    window.electronAPI.setCustomAppliances(appliances);
  }
}

function renderCustomAppliances() {
  const appliances = loadCustomAppliances();
  const container = document.getElementById('custom-appliances');
  container.innerHTML = '';
  appliances.forEach(a => {
    const item = document.createElement('div');
    item.className = 'calc-item';
    item.id = `custom-appliance-${a.id}`;
    item.innerHTML = `
      <div class="calc-label">${a.name} (${a.watts}W, ${a.durationMinutes}min)</div>
      <div class="calc-cost-row">
        <div class="calc-cost" id="calc-custom-${a.id}">--</div>
        <button class="calc-delete-btn" onclick="deleteCustomAppliance('${a.id}')" title="Remove">×</button>
      </div>`;
    container.appendChild(item);
  });
}

function updateCustomAppliances(data) {
  const appliances = loadCustomAppliances();
  const suffix = data.currency;
  appliances.forEach(a => {
    const el = document.getElementById(`calc-custom-${a.id}`);
    if (el) {
      const cost = calculateCost(a.watts / 1000, a.durationMinutes, data);
      el.textContent = formatCost(cost, suffix);
    }
  });
}

function showAddApplianceForm() {
  document.getElementById('add-appliance-form').style.display = 'flex';
  document.getElementById('add-appliance-btn').style.display = 'none';
  document.getElementById('new-appliance-name').focus();
}

function cancelAddAppliance() {
  document.getElementById('add-appliance-form').style.display = 'none';
  document.getElementById('add-appliance-btn').style.display = 'block';
  document.getElementById('new-appliance-name').value = '';
  document.getElementById('new-appliance-watts').value = '';
  document.getElementById('new-appliance-duration').value = '60';
}

function saveNewAppliance() {
  const name = document.getElementById('new-appliance-name').value.trim();
  const watts = parseInt(document.getElementById('new-appliance-watts').value);
  const duration = parseInt(document.getElementById('new-appliance-duration').value) || 60;
  if (!name || !watts || watts < 1) return;

  const appliances = loadCustomAppliances();
  appliances.push({ id: Date.now().toString(), name, watts, durationMinutes: duration });
  saveCustomAppliances(appliances);
  renderCustomAppliances();
  if (lastData) updateCustomAppliances(lastData);
  cancelAddAppliance();
}

function deleteCustomAppliance(id) {
  const appliances = loadCustomAppliances().filter(a => a.id !== id);
  saveCustomAppliances(appliances);
  renderCustomAppliances();
  if (lastData) updateCustomAppliances(lastData);
}

// Update chart
function updateChart(data) {
  const ctx = document.getElementById('priceChart').getContext('2d');
  
  // Use ALL prices (yesterday, today, tomorrow) for 48h window
  const allPrices = data.allPrices || [];
  
  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  const currentDate = now.getDate();
  
  const currentSegmentMinute = Math.floor(currentMinute / 15) * 15;
  
  const currentIndex = allPrices.findIndex(p => {
    const pHour = p.timestamp.getHours();
    const pMinute = p.timestamp.getMinutes();
    const pDate = p.timestamp.getDate();
    
    return pHour === currentHour && 
           pMinute === currentSegmentMinute && 
           pDate === currentDate;
  });

  console.log(`=== CHART UPDATE (48H CENTERED) ===`);
  console.log(`Current segment: ${currentHour}:${currentSegmentMinute.toString().padStart(2, '0')}`);
  console.log(`Current index: ${currentIndex} of ${allPrices.length} total prices`);
  console.log(`Time range: ${allPrices[0]?.timestamp.toLocaleString()} to ${allPrices[allPrices.length-1]?.timestamp.toLocaleString()}`);

  // Show 24h before (96 segments) and 24h after (96 segments) = 48h total
  const SEGMENTS_BEFORE = 96;  // 24 hours × 4 segments/hour
  const SEGMENTS_AFTER = 96;   // 24 hours × 4 segments/hour
  
  let startIndex = 0;
  let endIndex = allPrices.length;
  let visibleCurrentIndex = -1;
  
  if (currentIndex >= 0) {
    startIndex = Math.max(0, currentIndex - SEGMENTS_BEFORE);
    endIndex = Math.min(allPrices.length, currentIndex + SEGMENTS_AFTER + 1);
    visibleCurrentIndex = currentIndex - startIndex;
    
    console.log(`Window: ${startIndex} to ${endIndex} (current at index ${visibleCurrentIndex} of visible window)`);
  } else {
    console.warn('Current segment not found in price data!');
  }
  
  const visiblePrices = allPrices.slice(startIndex, endIndex);
  
  console.log(`Displaying ${visiblePrices.length} segments (should be ~193 for 48h window)`);
  
  const labels = visiblePrices.map(p => {
    const hour = p.timestamp.getHours();
    const minute = p.timestamp.getMinutes();
    return `${hour}:${minute.toString().padStart(2, '0')}`;
  });

  const prices = visiblePrices.map(p => p.pricePerKwh);
  
  const backgroundColor = [];
  const borderColor = [];
  const borderWidth = [];
  
  visiblePrices.forEach((p, index) => {
    const isCurrent = index === visibleCurrentIndex;
    
    if (isCurrent) {
      const currentBarColor = isDarkMode ? '#ffffff' : '#000000';
      backgroundColor.push(currentBarColor);
      borderColor.push(currentBarColor);
      borderWidth.push(4);
    } else {
      backgroundColor.push(p.color);
      borderColor.push(p.color);
      borderWidth.push(1);
    }
  });

  if (priceChart) {
    priceChart.destroy();
  }
  document.getElementById('reset-zoom-btn').style.display = 'none';

  // Remove any previous dblclick listener before creating new chart
  const canvas = document.getElementById('priceChart');
  canvas.replaceWith(canvas.cloneNode(true));
  const freshCtx = document.getElementById('priceChart').getContext('2d');

  priceChart = new Chart(freshCtx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: `Price (${data.currency}/kWh)`,
        data: prices,
        backgroundColor: backgroundColor,
        borderColor: borderColor,
        borderWidth: borderWidth,
        barPercentage: 0.95,
        categoryPercentage: 0.98
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              const index = context.dataIndex + startIndex;
              const price = allPrices[index];
              const isCurrent = context.dataIndex === visibleCurrentIndex;
              const isFuture = price.timestamp > now;

              let label = `${context.parsed.y.toFixed(2)} ${data.currency}/kWh`;
              if (isCurrent) label += ' ⚡ CURRENT';
              else if (isFuture) label += ' (upcoming)';
              else label += ' (past)';

              return label;
            },
            title: function(context) {
              const index = context[0].dataIndex + startIndex;
              const timestamp = allPrices[index].timestamp;
              const date = timestamp.getDate();
              const today = now.getDate();

              const hour = timestamp.getHours();
              const minute = timestamp.getMinutes();

              let dayLabel;
              if (date === today) dayLabel = 'Today';
              else if (date > today) dayLabel = 'Tomorrow';
              else dayLabel = 'Yesterday';

              return `${dayLabel} ${hour}:${minute.toString().padStart(2, '0')}`;
            }
          },
          backgroundColor: isDarkMode ? 'rgba(245, 245, 244, 0.95)' : 'rgba(41, 37, 36, 0.95)',
          titleColor: isDarkMode ? '#292524' : '#ffffff',
          bodyColor: isDarkMode ? '#78716c' : '#e7e5e4',
          padding: 12,
          titleFont: {
            size: 14,
            weight: '600',
            family: 'Inter'
          },
          bodyFont: {
            size: 13,
            family: 'Inter'
          },
          borderColor: isDarkMode ? '#44403c' : '#e7e5e4',
          borderWidth: 1
        },
        zoom: {
          zoom: {
            wheel: { enabled: true },
            pinch: { enabled: true },
            mode: 'x',
            onZoom: () => {
              document.getElementById('reset-zoom-btn').style.display = 'block';
            }
          },
          pan: {
            enabled: true,
            mode: 'x'
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: `Price (${data.currency}/kWh)`,
            font: {
              size: 13,
              weight: '500',
              family: 'Inter'
            },
            color: '#78716c'
          },
          ticks: {
            callback: function(value) {
              return value.toFixed(2);
            },
            font: {
              size: 11,
              family: 'Inter'
            },
            color: '#a8a29e'
          },
          grid: {
            color: isDarkMode ? '#3c3836' : '#f5f5f4'
          }
        },
        x: {
          title: {
            display: true,
            text: '48-Hour Price Window (Current Segment Highlighted)',
            font: {
              size: 13,
              weight: '500',
              family: 'Inter'
            },
            color: '#78716c'
          },
          ticks: {
            callback: function(value, index) {
              const actualIndex = index + startIndex;
              if (actualIndex < allPrices.length) {
                const timestamp = allPrices[actualIndex].timestamp;
                const minute = timestamp.getMinutes();
                const hour = timestamp.getHours();

                // Show only even hours at :00 to avoid overlap
                if (minute === 0 && hour % 2 === 0) {
                  return `${hour.toString().padStart(2, '0')}:00`;
                }
              }
              return null;
            },
            maxRotation: 0,
            autoSkip: false,
            font: {
              size: 10,
              family: 'Inter'
            },
            color: '#a8a29e'
          },
          grid: {
            color: function(context) {
              const index = context.index;
              const gridBase = isDarkMode ? '#3c3836' : '#f5f5f4';
              const currentLine = isDarkMode ? 'rgba(245, 245, 244, 0.2)' : 'rgba(41, 37, 36, 0.2)';
              return index === visibleCurrentIndex ? currentLine : gridBase;
            },
            lineWidth: function(context) {
              const index = context.index;
              return index === visibleCurrentIndex ? 3 : 1;
            }
          }
        }
      }
    }
  });

  // Double-click on chart to reset zoom
  document.getElementById('priceChart').addEventListener('dblclick', resetChartZoom);
}

// Update last update time
function updateLastUpdateTime(date) {
  const timeString = `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
  document.getElementById('last-update').textContent = timeString;
}

// Show/hide loading state
function showLoading(show) {
  // Could add a loading spinner here
}

// Show error message
function showError(message) {
  const errorContainer = document.getElementById('error-container');
  errorContainer.innerHTML = `<div class="error-message">${message}</div>`;
  errorContainer.classList.remove('hidden');
}

// Hide error message
function hideError() {
  document.getElementById('error-container').classList.add('hidden');
}

// Country selector functionality
function setupCountrySelector() {
  // Load saved country from localStorage
  const savedCountry = localStorage.getItem('nordpool-country');
  if (savedCountry && ['ee', 'fi', 'lv', 'lt'].includes(savedCountry)) {
    currentCountry = savedCountry;
  }

  // Update active button
  document.querySelectorAll('.country-btn').forEach(btn => {
    btn.classList.remove('active');
    if (btn.dataset.country === currentCountry) {
      btn.classList.add('active');
    }

    // Add click handler
    btn.addEventListener('click', async () => {
      const newCountry = btn.dataset.country;
      if (newCountry !== currentCountry) {
        currentCountry = newCountry;
        
        // Save to localStorage
        localStorage.setItem('nordpool-country', newCountry);
        
        // Update UI
        document.querySelectorAll('.country-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        // Reload prices
        await loadPrices(true);
      }
    });
  });
}

// Auto-refresh functionality
function startAutoRefresh() {
  const getMillisecondsUntilNextRefresh = () => {
    const now = new Date();
    const minutes = now.getMinutes();
    const seconds = now.getSeconds();
    const milliseconds = now.getMilliseconds();
    
    // Refresh at :01, :16, :31, :46
    const refreshMinutes = [1, 16, 31, 46];
    let nextRefreshMinute = refreshMinutes.find(m => m > minutes);
    
    if (!nextRefreshMinute) {
      nextRefreshMinute = refreshMinutes[0];
      const nextHour = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours() + 1, nextRefreshMinute, 0, 0);
      return nextHour - now;
    } else {
      const nextRefresh = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), nextRefreshMinute, 0, 0);
      return nextRefresh - now;
    }
  };
  
  const scheduleNextRefresh = () => {
    const msUntilNext = getMillisecondsUntilNextRefresh();
    
    setTimeout(() => {
      console.log('Auto-refresh triggered at 15-minute interval - forcing cache bypass');
      loadPrices(true);
      scheduleNextRefresh();
    }, msUntilNext);
  };
  
  scheduleNextRefresh();
}

// Global refresh function
function refreshData() {
  console.log('Manual refresh triggered - forcing cache bypass');
  loadPrices(true);
}

// Reset chart zoom to full 48h view
function resetChartZoom() {
  if (priceChart) {
    priceChart.resetZoom();
    document.getElementById('reset-zoom-btn').style.display = 'none';
  }
}

// Apply or remove dark mode class on body
function applyDarkMode(enabled) {
  document.body.classList.toggle('dark', enabled);
  localStorage.setItem('nordpool-darkmode', enabled ? 'true' : 'false');
}

// Initialize app
function setupUpdateButton() {
  if (!window.electronAPI || !window.electronAPI.onUpdateStatus) return;
  window.electronAPI.onUpdateStatus((status) => {
    const btn = document.getElementById('update-btn');
    if (!btn) return;
    btn.className = 'update-btn';
    if (status.state === 'available') {
      btn.classList.add('available');
      btn.style.display = 'flex';
      btn.innerHTML = `⬇ Update v${status.version}`;
    } else if (status.state === 'downloading') {
      btn.classList.add('downloading');
      btn.style.display = 'flex';
      btn.innerHTML = `⬇ Downloading ${status.percent}%`;
    } else if (status.state === 'downloaded') {
      btn.classList.add('downloaded');
      btn.style.display = 'flex';
      btn.innerHTML = `↺ Click to Update`;
    }
  });
}

function handleUpdateClick() {
  const btn = document.getElementById('update-btn');
  if (!btn) return;
  if (btn.classList.contains('available') && window.electronAPI) {
    window.electronAPI.downloadUpdate();
  } else if (btn.classList.contains('downloaded') && window.electronAPI) {
    window.electronAPI.restartToUpdate();
  }
}

async function init() {
  // Sync dark mode from electron-store (authoritative source)
  if (window.electronAPI && window.electronAPI.getDarkMode) {
    isDarkMode = await window.electronAPI.getDarkMode();
  } else {
    isDarkMode = localStorage.getItem('nordpool-darkmode') === 'true';
  }
  applyDarkMode(isDarkMode);

  // Listen for dark mode changes from settings window
  if (window.electronAPI && window.electronAPI.onDarkModeChange) {
    window.electronAPI.onDarkModeChange((enabled) => {
      isDarkMode = enabled;
      applyDarkMode(enabled);
      if (lastData) updateChart(lastData);
    });
  }

  // Load alert preferences from electron-store
  if (window.electronAPI && window.electronAPI.getAlertSettings) {
    const alertSettings = await window.electronAPI.getAlertSettings();
    lowPriceAlertEnabled = alertSettings.lowPriceAlert;
    highPriceAlertEnabled = alertSettings.highPriceAlert;
  }

  // Listen for alert setting changes from settings window
  if (window.electronAPI && window.electronAPI.onAlertSettingsChange) {
    window.electronAPI.onAlertSettingsChange((settings) => {
      lowPriceAlertEnabled = settings.lowPriceAlert;
      highPriceAlertEnabled = settings.highPriceAlert;
    });
  }

  // Load fee settings from electron-store
  if (window.electronAPI && window.electronAPI.getFeeSettings) {
    feeSettings = await window.electronAPI.getFeeSettings();
  }

  // Listen for fee setting changes from settings window
  if (window.electronAPI && window.electronAPI.onFeeSettingsChange) {
    window.electronAPI.onFeeSettingsChange((settings) => {
      feeSettings = settings;
      if (lastData) updateCalculator(lastData);
    });
  }

  setupCountrySelector();
  setupUpdateButton();
  await initCustomAppliances();
  renderCustomAppliances();
  await requestNotificationPermission();
  await loadPrices();
  startAutoRefresh();
}

document.addEventListener('DOMContentLoaded', init);
