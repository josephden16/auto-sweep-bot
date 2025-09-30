const { ethers } = require("ethers");
const fs = require("fs");
const fetch = require("node-fetch");
const {
  getWalletFromMnemonic,
  getTokenBalances,
  sweepToken,
  sweepNative,
  getExplorerLink,
} = require("./wallet-utils");

const runningSweepers = {}; // chainKey -> true/false

function logEvent(msg) {
  fs.appendFileSync(
    "logs/sweeper.log",
    `[${new Date().toISOString()}] ${msg}\n`
  );
}

// --- Helpers ---
async function getTokenPriceUSD(symbol) {
  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${symbol}&vs_currencies=usd`
    );
    const json = await res.json();
    return json[symbol]?.usd || 0;
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

    // Sweep native coin
    try {
      const nativeTxHash = await sweepNative(wallet, destAddress, chainKey);
      if (nativeTxHash) {
        const explorerLink = getExplorerLink(chainKey, nativeTxHash);
        notify(`💰 Swept native ${config.name} token\n🔗 ${explorerLink}`);
        logEvent(`[${config.name}] Native sweep tx: ${nativeTxHash}`);
      }
    } catch (err) {
      logEvent(`[${config.name}] Native sweep error: ${err.stack}`);
    }

    // Fetch token balances via Alchemy
    try {
      const tokens = await getTokenBalances(chainKey, wallet.address);

      for (const token of tokens) {
        try {
          const amountReadable = Number(
            ethers.utils.formatUnits(token.balance, token.decimals)
          );

          // Fetch USD price
          const price = await getTokenPriceUSD(token.symbol.toLowerCase());
          const valueUSD = amountReadable * price;

          if (valueUSD >= (config.usdThreshold || 1)) {
            const txHash = await sweepToken(wallet, destAddress, token);
            if (txHash) {
              const explorerLink = getExplorerLink(chainKey, txHash);
              notify(
                `💰 Swept ${amountReadable} ${
                  token.symbol
                } (~$${valueUSD.toFixed(2)}) on ${
                  config.name
                }\n🔗 ${explorerLink}`
              );
              logEvent(
                `[${config.name}] ERC20 sweep ${token.symbol} tx: ${txHash}`
              );
            }
          }
        } catch (err) {
          logEvent(`[${config.name}] ERC20 sweep error: ${err.stack}`);
        }
      }
    } catch (err) {
      logEvent(`[${config.name}] Token balance fetch error: ${err.stack}`);
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
