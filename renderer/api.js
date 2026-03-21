// Check if we're in Node.js or browser environment
const isNode = typeof module !== 'undefined' && module.exports;
let axios;

if (isNode) {
  axios = require('axios');
} else {
  axios = window.axios;
}

class NordPoolAPI {
  constructor() {
    this.baseURL = 'https://dashboard.elering.ee/api';
    this.cache = {
      prices: null,
      lastUpdate: null,
      cacheTimeout: 3600000, // 1 hour in milliseconds
      country: null // Track which country the cache is for
    };
    
    // Country configuration
    this.countries = {
      ee: { name: 'Estonia', currency: 's', apiCode: 'ee' },
      fi: { name: 'Finland', currency: 'c', apiCode: 'fi' },
      lv: { name: 'Latvia', currency: 's', apiCode: 'lv' },
      lt: { name: 'Lithuania', currency: 's', apiCode: 'lt' }
    };
  }

  /**
   * Fetch electricity prices from Elering API for specified country
   * @param {String} country - Country code (ee, fi, lv, lt)
   * @param {Boolean} forceRefresh - If true, bypass cache and fetch fresh data
   * @returns {Promise<Object>} Price data
   */
  async fetchPrices(country = 'ee', forceRefresh = false) {
    try {
      // Check cache first (unless force refresh or different country)
      if (!forceRefresh && this.cache.prices && this.cache.lastUpdate && this.cache.country === country) {
        const timeSinceUpdate = Date.now() - this.cache.lastUpdate;
        if (timeSinceUpdate < this.cache.cacheTimeout) {
          console.log(`Returning cached prices for ${country} (age: ${Math.floor(timeSinceUpdate / 60000)} minutes)`);
          return this.cache.prices;
        }
      }

      if (forceRefresh) {
        console.log('Force refresh - bypassing cache');
      }
      console.log(`Fetching fresh prices from Elering API for ${country.toUpperCase()}...`);
      
      // Calculate date range (today + tomorrow)
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 2);
      
      // Start from yesterday evening to get full context
      const startDate = new Date(today.getTime() - (24 * 60 * 60 * 1000));
      const endDate = new Date(tomorrow.getTime());
      
      const start = startDate.toISOString().split('.')[0] + '.000Z';
      const end = endDate.toISOString().split('.')[0] + '.999Z';
      
      console.log(`Fetching prices from ${start} to ${end}`);
      
      // Electron can call API directly (no CORS restrictions!)
      const apiUrl = `${this.baseURL}/nps/price`;
      
      const response = await axios.get(apiUrl, {
        params: { start: start, end: end },
        timeout: 15000,
        headers: { 'Accept': 'application/json' }
      });

      console.log('API Response received');
      
      const countryApiCode = this.countries[country]?.apiCode || country;
      if (response.data && response.data.data && response.data.data[countryApiCode]) {
        const processedData = this.processPriceData(response.data.data[countryApiCode], country);
        this.cache.prices = processedData;
        this.cache.lastUpdate = Date.now();
        this.cache.country = country;
        return processedData;
      } else {
        throw new Error(`Invalid API response format - missing data for country ${countryApiCode}`);
      }
        
    } catch (error) {
      console.error('Error fetching prices:', error.message);
      console.error('Full error:', error);
      
      // Return cached data if available and for same country
      if (this.cache.prices && this.cache.country === country) {
        const cacheAge = Math.floor((Date.now() - this.cache.lastUpdate) / 60000);
        console.warn(`API error - returning stale cache for ${country} (${cacheAge} minutes old)`);
        console.warn('Price data may be outdated. Will retry on next refresh.');
        return this.cache.prices;
      }
      
      throw new Error('Failed to fetch electricity prices: ' + error.message);
    }
  }

  /**
   * Process raw API data into usable format
   * @param {Array} rawData - Raw price data from API
   * @param {String} country - Country code
   * @returns {Object} Processed price data
   */
  processPriceData(rawData, country) {
    const now = new Date();
    const currentHour = now.getHours();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Convert timestamps and prices
    const prices = rawData
      .map(item => ({
        timestamp: new Date(item.timestamp * 1000),
        price: item.price / 10, // Convert €/MWh to local currency per kWh
        pricePerKwh: item.price / 10
      }))
      .sort((a, b) => a.timestamp - b.timestamp);

    console.log(`Processed ${prices.length} price points for ${country.toUpperCase()}`);

    // Keep ALL prices for 48h window (yesterday, today, tomorrow)
    // Separate for statistics and recommendations
    const todayPrices = prices.filter(p => 
      p.timestamp >= today && p.timestamp < tomorrow
    );

    const tomorrowPrices = prices.filter(p => 
      p.timestamp >= tomorrow
    );
    
    const yesterdayPrices = prices.filter(p =>
      p.timestamp < today
    );

    console.log(`Yesterday: ${yesterdayPrices.length} prices, Today: ${todayPrices.length} prices, Tomorrow: ${tomorrowPrices.length} prices`);

    // Find current 15-minute segment
    const currentMinute = now.getMinutes();
    const currentSegmentMinute = Math.floor(currentMinute / 15) * 15;
    
    console.log(`Looking for current segment: ${currentHour}:${currentSegmentMinute.toString().padStart(2, '0')}`);

    // Find current price - match hour, minute segment, AND date
    const currentPrice = prices.find(p => 
      p.timestamp.getHours() === currentHour &&
      p.timestamp.getMinutes() === currentSegmentMinute &&
      p.timestamp.getDate() === now.getDate()
    );

    if (currentPrice) {
      console.log(`Found current price: ${currentPrice.pricePerKwh.toFixed(2)} for ${country.toUpperCase()} at ${currentPrice.timestamp.toLocaleString()}`);
    } else {
      console.warn(`Could not find price for ${currentHour}:${currentSegmentMinute.toString().padStart(2, '0')}`);
    }

    // Find next 15-minute segment price
    let nextPrice = null;
    const nextSegmentMinute = currentSegmentMinute + 15;
    
    if (nextSegmentMinute < 60) {
      nextPrice = prices.find(p => 
        p.timestamp.getHours() === currentHour &&
        p.timestamp.getMinutes() === nextSegmentMinute &&
        p.timestamp.getDate() === now.getDate()
      );
    } else {
      const nextHour = currentHour + 1;
      if (nextHour < 24) {
        nextPrice = prices.find(p => 
          p.timestamp.getHours() === nextHour &&
          p.timestamp.getMinutes() === 0 &&
          p.timestamp.getDate() === now.getDate()
        );
      } else if (tomorrowPrices.length > 0) {
        nextPrice = tomorrowPrices.find(p => 
          p.timestamp.getHours() === 0 &&
          p.timestamp.getMinutes() === 0
        );
      }
    }

    // Calculate statistics using today's prices only
    if (todayPrices.length === 0) {
      throw new Error('No price data available');
    }

    const todayPriceValues = todayPrices.map(p => p.price);

    const stats = {
      min: Math.min(...todayPriceValues),
      max: Math.max(...todayPriceValues),
      average: todayPriceValues.reduce((a, b) => a + b, 0) / todayPriceValues.length,
      q1: this.calculatePercentile(todayPriceValues, 25),
      q3: this.calculatePercentile(todayPriceValues, 75)
    };

    // Add color coding to each price (all prices including yesterday)
    prices.forEach(p => {
      if (p.price <= stats.q1) {
        p.color = '#16a34a'; // Green (cheap)
        p.zone = 'cheap';
      } else if (p.price >= stats.q3) {
        p.color = '#dc2626'; // Red (expensive)
        p.zone = 'expensive';
      } else {
        p.color = '#ca8a04'; // Yellow (moderate)
        p.zone = 'moderate';
      }
    });

    // Add country info
    const countryInfo = this.countries[country] || this.countries.ee;

    return {
      country: country,
      countryName: countryInfo.name,
      currency: countryInfo.currency,
      current: currentPrice,
      next: nextPrice,
      allPrices: prices, // ALL prices for 48h chart (includes yesterday, today, tomorrow)
      today: todayPrices,
      tomorrow: tomorrowPrices,
      yesterday: yesterdayPrices,
      stats: stats,
      lastUpdate: new Date()
    };
  }

  /**
   * Calculate percentile
   */
  calculatePercentile(arr, percentile) {
    const sorted = [...arr].sort((a, b) => a - b);
    const index = (percentile / 100) * (sorted.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index - lower;
    
    return sorted[lower] * (1 - weight) + sorted[upper] * weight;
  }
}

// Export for both Node.js and browser
if (isNode) {
  module.exports = NordPoolAPI;
} else {
  window.NordPoolAPI = NordPoolAPI;
}
