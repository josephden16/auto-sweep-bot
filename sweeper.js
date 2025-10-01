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

const runningSweepers = {}; // chainKey -> true/false

function logEvent(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}\n`);
  fs.appendFileSync(
    "logs/sweeper.log",
    `[${new Date().toISOString()}] ${msg}\n`
  );
}

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
function startSweeper(chainKey, config, mnemonic, destAddress, notify) {
  const wallet = getWalletFromMnemonic(mnemonic, chainKey);

  notify(
    `🚀 Sweeper started on ${config.name} for ${wallet.address} → ${destAddress}`
  );
  runningSweepers[chainKey] = true;

  async function loop() {
    if (!runningSweepers[chainKey]) return;

    // Check wallet native balance first to detect dust
    let nativeBalance;
    try {
      nativeBalance = await wallet.provider.getBalance(wallet.address);
    } catch (err) {
      logEvent(
        `[${config.name}] Failed to check wallet balance: ${err.message}`
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
      logEvent(`[${config.name}] Token balance fetch error: ${err.stack}`);
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

    // Sweep native coin with gas reservation (only if value >= $10)
    if (shouldSweepNative) {
      try {
        const nativeTxHash = await sweepNative(
          wallet,
          destAddress,
          chainKey,
          gasReserve
        );
        if (nativeTxHash) {
          const explorerLink = getExplorerLink(chainKey, nativeTxHash);
          notify(
            `💰 Swept native ${config.name} token (~$${nativeValueUSD.toFixed(
              2
            )})\n🔗 ${explorerLink}`
          );
          logEvent(
            `[${config.name}] Native sweep tx: ${nativeTxHash} (reserved ${
              gasReserve ? gasReserve.toString() : "0"
            } gas for tokens)`
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
        if (txHash) {
          const explorerLink = getExplorerLink(chainKey, txHash);
          notify(
            `💰 Swept ${token.amountReadable} ${
              token.symbol
            } (~$${token.valueUSD.toFixed(2)}) on ${
              config.name
            }\n🔗 ${explorerLink}`
          );
          logEvent(
            `[${config.name}] ERC20 sweep ${token.symbol} tx: ${txHash}`
          );
        }
      } catch (err) {
        logEvent(
          `[${config.name}] ERC20 sweep error for ${token.symbol}: ${err.stack}`
        );
      }
    }

    setTimeout(loop, config.pollInterval || 20000);
  }

  loop();
}

function stopSweeper(chainKey) {
  runningSweepers[chainKey] = false;
}

function stopAllSweepers() {
  Object.keys(runningSweepers).forEach((k) => {
    runningSweepers[k] = false;
  });
}

module.exports = {
  startSweeper,
  stopSweeper,
  stopAllSweepers,
  runningSweepers,
};
