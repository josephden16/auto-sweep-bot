const { ethers } = require("ethers");
const fetch = require("node-fetch");
const {
  getWalletFromMnemonic,
  getTokenBalances,
  sweepToken,
  sweepNative,
  getExplorerLink,
  estimateTokenGasCosts,
  getOptimalGasPricing,
  getChainConfigWithMode,
} = require("./wallet-utils");

// ===== OPTIMIZED PRICE MANAGER =====
class PriceManager {
  constructor() {
    this.cache = new Map(); // symbol -> { price, timestamp }
    this.pendingRequests = new Map(); // symbol -> Promise
    this.lastRequestTime = 0;
    this.requestQueue = [];
    this.isProcessingQueue = false;

    // Configuration - Updated for CoinGecko rate limits (30 calls/min, 10K calls/month)
    this.CACHE_TTL = 30 * 60 * 1000; // 30 minutes (conservative caching for rate limit preservation)
    this.RATE_LIMIT_DELAY = 2000; // 2 seconds between requests (30 calls/min = 1 call every 2s)
    this.BATCH_SIZE = 30; // Max symbols per batch request
    this.MAX_RETRIES = 3;
    this.RETRY_DELAY = 5000; // 5 seconds (increased for rate limit scenarios)
  }

  // Get price with caching and batching
  async getPrice(symbol) {
    if (!symbol) return 0;

    const normalizedSymbol = symbol.toLowerCase();

    // Check cache first
    const cached = this.cache.get(normalizedSymbol);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.price;
    }

    // Check if request is already pending
    if (this.pendingRequests.has(normalizedSymbol)) {
      try {
        return await this.pendingRequests.get(normalizedSymbol);
      } catch (error) {
        // If pending request fails, fall back to stale cache if available
        if (cached) {
          console.log(`⚠️ Using stale cached price for ${normalizedSymbol} due to fetch error: $${cached.price}`);
          return cached.price;
        }
        return 0;
      }
    }

    // Create new request promise
    const requestPromise = this._queuePriceRequest(normalizedSymbol);
    this.pendingRequests.set(normalizedSymbol, requestPromise);

    try {
      const price = await requestPromise;
      return price;
    } catch (error) {
      // If request fails, fall back to stale cache if available
      if (cached) {
        console.log(`⚠️ Using stale cached price for ${normalizedSymbol} due to fetch error: $${cached.price}`);
        return cached.price;
      }
      console.log(`❌ No price available for ${normalizedSymbol}: ${error.message}`);
      return 0;
    } finally {
      this.pendingRequests.delete(normalizedSymbol);
    }
  }

  // Get multiple prices efficiently
  async getPrices(symbols) {
    if (!symbols || symbols.length === 0) return {};

    const normalizedSymbols = [
      ...new Set(symbols.filter((s) => s).map((s) => s.toLowerCase())),
    ];
    const results = {};
    const needsRefresh = [];

    // Check cache for each symbol
    for (const symbol of normalizedSymbols) {
      const cached = this.cache.get(symbol);
      if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
        results[symbol] = { usd: cached.price };
      } else {
        needsRefresh.push(symbol);
      }
    }

    // Fetch missing prices in batches
    if (needsRefresh.length > 0) {
      try {
        const freshPrices = await this._batchFetchPrices(needsRefresh);
        Object.assign(results, freshPrices);
      } catch (error) {
        console.log(`⚠️ Batch price fetch failed, using any available stale cache data`);
        // For symbols that failed to fetch, check if we have stale cache data
        for (const symbol of needsRefresh) {
          const cached = this.cache.get(symbol);
          if (cached && !results[symbol]) {
            results[symbol] = { usd: cached.price };
            console.log(`📦 Using stale cached price for ${symbol}: $${cached.price}`);
          }
        }
      }
    }

    return results;
  }

  // Queue a price request for batch processing
  async _queuePriceRequest(symbol) {
    return new Promise((resolve, reject) => {
      this.requestQueue.push({ symbol, resolve, reject });
      this._processQueue();
    });
  }

  // Process queued requests in batches
  async _processQueue() {
    if (this.isProcessingQueue || this.requestQueue.length === 0) return;

    this.isProcessingQueue = true;

    try {
      // Wait for rate limit
      const timeSinceLastRequest = Date.now() - this.lastRequestTime;
      if (timeSinceLastRequest < this.RATE_LIMIT_DELAY) {
        await new Promise((resolve) =>
          setTimeout(resolve, this.RATE_LIMIT_DELAY - timeSinceLastRequest)
        );
      }

      // Take batch from queue
      const batch = this.requestQueue.splice(0, this.BATCH_SIZE);
      const symbols = batch.map((item) => item.symbol);

      try {
        const prices = await this._batchFetchPrices(symbols);

        // Resolve all requests in batch
        for (const item of batch) {
          const price = prices[item.symbol]?.usd || 0;
          item.resolve(price);
        }
      } catch (error) {
        // Reject all requests in batch
        for (const item of batch) {
          item.reject(error);
        }
      }

      this.lastRequestTime = Date.now();
    } finally {
      this.isProcessingQueue = false;

      // Process remaining queue items
      if (this.requestQueue.length > 0) {
        setTimeout(() => this._processQueue(), this.RATE_LIMIT_DELAY);
      }
    }
  }

  // Batch fetch prices from CoinGecko with retry logic
  async _batchFetchPrices(symbols, retryCount = 0) {
    if (symbols.length === 0) return {};

    try {
      const symbolsParam = symbols.join(",");
      const url = `https://api.coingecko.com/api/v3/simple/price?symbols=${symbolsParam}&vs_currencies=usd`;

      console.log(
        `🔍 Fetching prices for ${symbols.length} symbols: ${symbols.join(
          ", "
        )}`
      );

      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": "Auto-Sweep-Bot/1.0",
        },
      });

      if (response.status === 429) {
        // Rate limited - return cached data immediately instead of waiting
        console.log(`⚠️ CoinGecko rate limited - using cached data to avoid delays`);
        return this._getCachedPricesForSymbols(symbols);
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      // Cache results
      for (const [symbol, priceData] of Object.entries(data)) {
        if (priceData && priceData.usd) {
          this.cache.set(symbol, {
            price: priceData.usd,
            timestamp: Date.now(),
          });
        }
      }

      console.log(`✅ Cached ${Object.keys(data).length} price(s)`);
      return data;
    } catch (error) {
      console.log(
        `❌ Price fetch error (attempt ${retryCount + 1}): ${error.message}`
      );

      if (retryCount < this.MAX_RETRIES) {
        const delay = this.RETRY_DELAY * Math.pow(2, retryCount); // Exponential backoff
        console.log(`⏳ Retrying in ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        return await this._batchFetchPrices(symbols, retryCount + 1);
      }

      // On final failure, return cached data if available, otherwise empty object
      console.log(
        `💥 Final failure fetching prices for: ${symbols.join(", ")} - falling back to cached data`
      );
      const cachedData = this._getCachedPricesForSymbols(symbols);
      if (Object.keys(cachedData).length > 0) {
        console.log(`✅ Using cached data for ${Object.keys(cachedData).length} symbols`);
        return cachedData;
      }
      return {};
    }
  }

  // Helper method to get cached prices for specific symbols
  _getCachedPricesForSymbols(symbols) {
    const result = {};
    for (const symbol of symbols) {
      const cached = this.cache.get(symbol);
      if (cached) {
        result[symbol] = { usd: cached.price };
        console.log(`📦 Using cached price for ${symbol}: $${cached.price} (age: ${Math.round((Date.now() - cached.timestamp) / 1000)}s)`);
      }
    }
    return result;
  }

  // Clear expired cache entries
  clearExpiredCache() {
    const now = Date.now();
    for (const [symbol, data] of this.cache.entries()) {
      if (now - data.timestamp > this.CACHE_TTL) {
        this.cache.delete(symbol);
      }
    }
  }

  // Get cache stats for debugging
  getCacheStats() {
    return {
      size: this.cache.size,
      pendingRequests: this.pendingRequests.size,
      queueLength: this.requestQueue.length,
    };
  }

  // Check if we have any cached price (even if stale) for emergency fallback
  hasAnyCachedPrice(symbol) {
    const normalizedSymbol = symbol.toLowerCase();
    return this.cache.has(normalizedSymbol);
  }

  // Get stale cached price if available (for rate limit scenarios)
  getStaleCachedPrice(symbol) {
    const normalizedSymbol = symbol.toLowerCase();
    const cached = this.cache.get(normalizedSymbol);
    return cached ? cached.price : null;
  }
}

// Global price manager instance
const priceManager = new PriceManager();

// Pre-warm cache with common tokens on startup
async function preWarmPriceCache() {
  const commonTokens = ["eth", "matic", "mnt", "usdt", "usdc", "weth", "wbtc"];
  console.log("🔥 Pre-warming price cache with common tokens...");
  try {
    await priceManager.getPrices(commonTokens);
    console.log("✅ Price cache pre-warmed successfully");
  } catch (error) {
    console.log("⚠️ Failed to pre-warm price cache:", error.message);
  }
}

// Pre-warm cache on startup (after a short delay)
setTimeout(preWarmPriceCache, 5000);

// Clean up expired cache entries every 10 minutes
setInterval(() => priceManager.clearExpiredCache(), 10 * 60 * 1000);

const runningSweepers = {}; // userKey-chainKey -> true/false
const processedTransactions = new Set(); // Track processed transaction hashes
const processingTransactions = {}; // userKey-chainKey -> boolean (true when processing transactions)
const sweeperIntervals = {}; // userKey-chainKey -> intervalId

function logEvent(msg, userId = null) {
  const logMsg = userId ? `[User: ${userId.substring(0, 8)}...] ${msg}` : msg;
  console.log(`[${new Date().toISOString()}] ${logMsg}\n`);
  // fs.appendFileSync(
  //   "logs/sweeper.log",
  //   `[${new Date().toISOString()}] ${logMsg}\n`
  // );
}

// Clean up old processed transactions periodically to prevent memory leaks
function cleanupProcessedTransactions() {
  // Keep the last 1000 transactions to prevent memory issues
  if (processedTransactions.size > 1000) {
    const transactionsArray = Array.from(processedTransactions);
    processedTransactions.clear();
    // Keep the most recent 500 transactions
    transactionsArray
      .slice(-500)
      .forEach((tx) => processedTransactions.add(tx));
    logEvent(
      `Cleaned up processed transactions cache, kept ${processedTransactions.size} recent entries`
    );
  }
}

// Run cleanup every hour
setInterval(cleanupProcessedTransactions, 60 * 60 * 1000);

// --- Helpers ---
async function getTokenList() {
  try {
    const res = await fetch(`https://api.coingecko.com/api/v3/coins/list`);
    const json = await res.json();
    return json;
  } catch (err) {
    logEvent(`Price fetch error: ${err.message}`);
    return 0;
  }
}

async function getBatchTokenPricesUSD(symbols) {
  try {
    // Use optimized price manager
    return await priceManager.getPrices(symbols);
  } catch (err) {
    logEvent(`Batch price fetch error: ${err.message}`);
    return {};
  }
}

async function getTokenPriceUSD(symbol) {
  try {
    // Use optimized price manager
    return await priceManager.getPrice(symbol);
  } catch (err) {
    logEvent(`Price fetch error: ${err.message}`);
    return 0;
  }
}

// Debug function to monitor price cache performance
function logPriceCacheStats() {
  const stats = priceManager.getCacheStats();
  console.log(
    `📊 Price Cache Stats: ${stats.size} cached, ${stats.pendingRequests} pending, ${stats.queueLength} queued`
  );
}

// Log cache stats every 5 minutes for monitoring
setInterval(logPriceCacheStats, 5 * 60 * 1000);

// --- Sweeper loop ---
function startSweeper(
  chainKey,
  config,
  mnemonic,
  destAddress,
  notify,
  userId = "default"
) {
  const userChainKey = `${userId}-${chainKey}`;

  if (runningSweepers[userChainKey]) {
    logEvent(
      `Sweeper already running for user ${userId} on ${chainKey}`,
      userId
    );
    return userChainKey;
  }

  const wallet = getWalletFromMnemonic(mnemonic, chainKey);

  const friendlyChainName = config.name
    .replace(" Testnet", "")
    .replace(" Sepolia", "")
    .replace(" Amoy", "");
  const shortWalletAddress = `${wallet.address.substring(
    0,
    6
  )}...${wallet.address.substring(wallet.address.length - 4)}`;
  const shortDestAddress = `${destAddress.substring(
    0,
    6
  )}...${destAddress.substring(destAddress.length - 4)}`;

  notify(
    `🎉 Great! I'm now watching your ${friendlyChainName} wallet for funds to collect!\n\n📱 Wallet: ${shortWalletAddress}\n🏦 Funds will go to: ${shortDestAddress}\n\n� Starting immediate sweep check...\n�💫 You'll be notified whenever I find and move funds for you!`
  );
  runningSweepers[userChainKey] = true;
  processingTransactions[userChainKey] = false; // Initialize processing state

  // Flag to force immediate execution on first run
  let isFirstRun = true;

  // Helper function to schedule next loop iteration
  function scheduleNextLoop() {
    if (isFirstRun) {
      isFirstRun = false;
      logEvent(
        `[${config.name}] ✅ Immediate sweep check completed for user ${userId}`,
        userId
      );
    }
    setTimeout(loop, config.pollInterval || 60000);
  }

  async function loop() {
    if (!runningSweepers[userChainKey]) return;

    // Check if transactions are currently being processed (skip only if not first run)
    if (processingTransactions[userChainKey] && !isFirstRun) {
      logEvent(
        `[${config.name}] Transactions still processing, skipping this cycle`,
        userId
      );
      scheduleNextLoop();
      return;
    }

    // Log immediate execution for first run
    if (isFirstRun) {
      logEvent(
        `[${config.name}] 🚀 Starting immediate sweep check for user ${userId}`,
        userId
      );
    }

    // Check wallet native balance first to detect dust
    let nativeBalance;
    try {
      nativeBalance = await wallet.provider.getBalance(wallet.address);
    } catch (err) {
      logEvent(
        `[${config.name}] Failed to check wallet balance: ${err.message}`,
        userId
      );
      scheduleNextLoop();
      return;
    }

    // Calculate minimum gas needed for basic operations using optimal pricing
    const gasPricing = await getOptimalGasPricing(wallet.provider);
    const effectiveGasPrice = gasPricing.gasPrice || gasPricing.maxFeePerGas;
    const basicTransferCost = effectiveGasPrice * 21000n; // Cost for basic native transfer
    const tokenTransferCost = effectiveGasPrice * 78000n; // Conservative cost for ERC-20 transfer (65k + 20% buffer)

    // Get chain config for proper native symbol
    const chainConfig = getChainConfigWithMode(chainKey);
    const nativeSymbol = chainConfig?.nativeSymbol || "ETH";

    // Fetch token balances first to estimate gas needed
    let tokensToSweep = [];
    let allPrices = {};

    try {
      const tokens = await getTokenBalances(chainKey, wallet.address);

      // Collect all symbols for batch price fetching
      const symbolsToFetch = [];

      // Add token symbols
      for (const token of tokens) {
        const symbol = token.symbol.toLowerCase();
        symbolsToFetch.push(symbol);
      }

      // Add native token symbol
      let nativePriceSymbol = nativeSymbol.toLowerCase();
      symbolsToFetch.push(nativePriceSymbol);

      // Fetch all prices in one request
      allPrices = await getBatchTokenPricesUSD(symbolsToFetch);

      // Evaluate tokens with fetched prices
      for (const token of tokens) {
        try {
          const amountReadable = Number(
            ethers.formatUnits(token.balance, token.decimals)
          );

          // Get USD price from batch result
          const price = allPrices[token.symbol.toLowerCase()]?.usd || 0;
          const valueUSD = amountReadable * price;

          if (valueUSD >= (config.usdThreshold || 1)) {
            tokensToSweep.push({ ...token, valueUSD, amountReadable });
          }
        } catch (err) {
          logEvent(
            `[${config.name}] Token evaluation error for ${token.symbol}: ${err.message}`
          );
        }
      }

      // Sort tokens by USD value in descending order (highest value first)
      tokensToSweep.sort((a, b) => b.valueUSD - a.valueUSD);

      if (tokensToSweep.length > 0) {
        logEvent(
          `[${config.name}] Found ${tokensToSweep.length} tokens to sweep, ordered by value: ` +
            tokensToSweep
              .map((t) => `${t.symbol} ($${t.valueUSD.toFixed(2)})`)
              .join(", "),
          userId
        );
      }
    } catch (err) {
      logEvent(
        `[${config.name}] Token balance fetch error: ${err.stack}`,
        userId
      );
    }

    // Check if wallet is dust (insufficient for any meaningful operations)
    const minimumNeededForTokens =
      tokensToSweep.length > 0 ? tokenTransferCost : 0n;
    const minimumNeeded = basicTransferCost + minimumNeededForTokens;

    if (nativeBalance < minimumNeeded && tokensToSweep.length > 0) {
      const nativeFormatted = ethers.formatEther(nativeBalance);
      const neededFormatted = ethers.formatEther(minimumNeeded);

      logEvent(
        `[${config.name}] 💨 Wallet has dust balance (${nativeFormatted} ${nativeSymbol}). ` +
          `Need ${neededFormatted} ${nativeSymbol} for ${tokensToSweep.length} token transfers. ` +
          `Skipping sweep operations until funded.`
      );

      // Skip this iteration but continue monitoring
      scheduleNextLoop();
      return;
    }

    // If native balance is too low even for itself, skip everything
    if (nativeBalance < basicTransferCost && nativeBalance > 0n) {
      const nativeFormatted = ethers.formatEther(nativeBalance);
      const neededFormatted = ethers.formatEther(basicTransferCost);

      logEvent(
        `[${config.name}] 💨 Wallet has dust balance (${nativeFormatted} ${nativeSymbol}). ` +
          `Need ${neededFormatted} ${nativeSymbol} for native transfer. ` +
          `Skipping all operations until funded.`
      );

      scheduleNextLoop();
      return;
    }

    // Estimate total gas needed for all token transfers
    let gasReserve = null;
    if (tokensToSweep.length > 0) {
      try {
        gasReserve = await estimateTokenGasCosts(
          wallet,
          destAddress,
          tokensToSweep
        );
        logEvent(
          `[${
            config.name
          }] Estimated gas reserve needed: ${gasReserve.toString()} for ${
            tokensToSweep.length
          } tokens`
        );
      } catch (err) {
        logEvent(`[${config.name}] Gas estimation error: ${err.message}`);
      }
    }

    // Check native token USD value before sweeping
    let shouldSweepNative = false;
    let nativeValueUSD = 0;

    if (nativeBalance > basicTransferCost + (gasReserve || 0n)) {
      try {
        // Calculate the amount that would actually be swept (minus gas costs)
        const totalGasNeeded = gasReserve
          ? basicTransferCost + gasReserve * effectiveGasPrice
          : basicTransferCost;
        const sweepableAmount = nativeBalance - totalGasNeeded;

        if (sweepableAmount > 0n) {
          const sweepableFormatted = Number(
            ethers.formatEther(sweepableAmount)
          );

          // Get USD price for native token from batch result
          let priceSymbol = nativeSymbol.toLowerCase();

          const nativePrice = allPrices[priceSymbol]?.usd || 0;

          if (nativePrice === 0) {
            logEvent(
              `[${config.name}] Native token price not available for ${priceSymbol}. Skipping native sweep.`
            );
            shouldSweepNative = false;
          } else {
            nativeValueUSD = sweepableFormatted * nativePrice;

            // Check if native token value meets USD threshold
            const nativeUsdThreshold = config.nativeUsdThreshold || 10;
            if (nativeValueUSD >= nativeUsdThreshold) {
              shouldSweepNative = true;
            } else {
              logEvent(
                `[${
                  config.name
                }] 💰 Native ${nativeSymbol} value ($${nativeValueUSD.toFixed(
                  2
                )}) below $${nativeUsdThreshold} threshold. ` +
                  `Amount: ${sweepableFormatted.toFixed(
                    6
                  )} ${nativeSymbol}. Skipping native sweep.`
              );
            }
          }
        }
      } catch (err) {
        logEvent(
          `[${config.name}] Native token USD evaluation error: ${err.message}`
        );
        // If price fetch fails, skip native sweep to be safe
        shouldSweepNative = false;
      }
    }

    // Set processing flag before starting any transactions
    processingTransactions[userChainKey] = true;

    try {
      // Sweep native coin with gas reservation (only if value >= $10)
      if (shouldSweepNative) {
        try {
          const nativeTxHash = await sweepNative(
            wallet,
            destAddress,
            chainKey,
            gasReserve
          );
          if (nativeTxHash && !processedTransactions.has(nativeTxHash)) {
            // Mark transaction as processed to prevent duplicate notifications
            processedTransactions.add(nativeTxHash);

            const explorerLink = getExplorerLink(chainKey, nativeTxHash);
            const friendlyChainName = config.name
              .replace(" Testnet", "")
              .replace(" Sepolia", "")
              .replace(" Amoy", "");
            notify(
              `💰 Excellent! I just collected $${nativeValueUSD.toFixed(
                2
              )} worth of ${friendlyChainName} tokens for you!\n\n✨ Your funds are safely on their way to your main wallet.\n\n🔗 [View transaction details](${explorerLink})`
            );
            logEvent(
              `[${config.name}] Native sweep tx: ${nativeTxHash} (reserved ${
                gasReserve ? gasReserve.toString() : "0"
              } gas for tokens)`
            );
          } else if (nativeTxHash && processedTransactions.has(nativeTxHash)) {
            logEvent(
              `[${config.name}] Native sweep tx already processed: ${nativeTxHash} - skipping notification`
            );
          }
        } catch (err) {
          logEvent(`[${config.name}] Native sweep error: ${err.stack}`);
        }
      }

      // Sweep ERC-20 tokens
      for (const token of tokensToSweep) {
        try {
          const txHash = await sweepToken(wallet, destAddress, token);
          if (txHash && !processedTransactions.has(txHash)) {
            // Mark transaction as processed to prevent duplicate notifications
            processedTransactions.add(txHash);

            const explorerLink = getExplorerLink(chainKey, txHash);
            const friendlyChainName = config.name
              .replace(" Testnet", "")
              .replace(" Sepolia", "")
              .replace(" Amoy", "");
            notify(
              `🪙 Fantastic! I collected ${token.amountReadable} ${
                token.symbol
              } (worth $${token.valueUSD.toFixed(
                2
              )}) from your ${friendlyChainName} wallet!\n\n🎯 Your tokens are now safely in your main wallet.\n\n🔗 [View transaction details](${explorerLink})`
            );
            logEvent(
              `[${config.name}] ERC20 sweep ${token.symbol} tx: ${txHash}`
            );
          } else if (txHash && processedTransactions.has(txHash)) {
            logEvent(
              `[${config.name}] ERC20 sweep tx already processed: ${txHash} - skipping notification`
            );
          }
        } catch (err) {
          logEvent(
            `[${config.name}] ERC20 sweep error for ${token.symbol}: ${err.stack}`
          );
        }
      }
    } finally {
      // Always clear the processing flag, even if errors occurred
      processingTransactions[userChainKey] = false;
    }

    scheduleNextLoop();
  }

  // Start the loop
  loop();

  // Store the interval ID for potential cleanup
  sweeperIntervals[userChainKey] = true;

  logEvent(`Started sweeper for user ${userId} on chain ${chainKey}`, userId);
  return userChainKey;
}

function stopSweeper(chainKey, userId = "default") {
  const userChainKey = `${userId}-${chainKey}`;
  runningSweepers[userChainKey] = false;
  processingTransactions[userChainKey] = false; // Clear processing state
  delete sweeperIntervals[userChainKey];
  logEvent(`[${chainKey}] Sweeper stopped`, userId);
}

function stopAllSweepers() {
  Object.keys(runningSweepers).forEach((k) => {
    runningSweepers[k] = false;
    processingTransactions[k] = false; // Clear processing state for all chains
  });
  // Clear processed transactions when stopping all sweepers
  processedTransactions.clear();
  logEvent("All sweepers stopped and transaction cache cleared");
}

module.exports = {
  startSweeper,
  stopSweeper,
  stopAllSweepers,
  runningSweepers,
};
