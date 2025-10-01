const { ethers } = require("ethers");
const fs = require("fs");
const fetch = require("node-fetch");
const {
  getWalletFromMnemonic,
  getTokenBalances,
  sweepToken,
  sweepNative,
  getExplorerLink,
  estimateTokenGasCosts,
  getChainConfigWithMode,
  getOptimalGasPricing,
} = require("./wallet-utils");

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
    // Remove duplicates and filter out empty symbols
    const uniqueSymbols = [
      ...new Set(symbols.filter((symbol) => symbol && symbol.trim())),
    ];

    if (uniqueSymbols.length === 0) {
      return {};
    }

    const symbolsParam = uniqueSymbols.join(",");
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?symbols=${symbolsParam}&vs_currencies=usd`
    );
    const json = await res.json();

    if (res.ok) {
      return json;
    } else {
      throw new Error(`CoinGecko API error: ${res.status} ${res.statusText}`);
    }
  } catch (err) {
    logEvent(`Batch price fetch error: ${err.message}`);
    return {};
  }
}

async function getTokenPriceUSD(symbol) {
  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${symbol}&vs_currencies=usd`
    );
    const json = await res.json();

    if (res.ok) {
      return json[symbol]?.usd || 0;
    } else {
      throw new Error(`CoinGecko API error: ${res.status} ${res.statusText}`);
    }
  } catch (err) {
    logEvent(`Price fetch error: ${err.message}`);
    return 0;
  }
}

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
    `🎉 Great! I'm now watching your ${friendlyChainName} wallet for funds to collect!\n\n📱 Wallet: ${shortWalletAddress}\n🏦 Funds will go to: ${shortDestAddress}\n\n💫 You'll be notified whenever I find and move funds for you!`
  );
  runningSweepers[userChainKey] = true;
  processingTransactions[userChainKey] = false; // Initialize processing state

  async function loop() {
    if (!runningSweepers[userChainKey]) return;

    // Check if transactions are currently being processed
    if (processingTransactions[userChainKey]) {
      logEvent(
        `[${config.name}] Transactions still processing, skipping this cycle`,
        userId
      );
      setTimeout(loop, config.pollInterval || 20000);
      return;
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
      setTimeout(loop, config.pollInterval || 20000);
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
      setTimeout(loop, config.pollInterval || 20000);
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

      setTimeout(loop, config.pollInterval || 20000);
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

    setTimeout(loop, config.pollInterval || 60 * 1000);
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
