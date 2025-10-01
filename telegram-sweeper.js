const TelegramBot = require("node-telegram-bot-api");
const { ethers } = require("ethers");
require("dotenv").config();

const { startSweeper, stopAllSweepers, runningSweepers } = require("./sweeper");

const {
  getWalletFromMnemonic,
  getTokenBalances,
  getActiveChains,
  isTestnetMode,
  formatNativeBalance,
  getNativeTokenInfo,
} = require("./wallet-utils");

const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// --- Chain configs based on TEST_MODE ---

// Send startup message to Telegram
bot.sendMessage(
  CHAT_ID,
  `🤖 Bot is now active\n🌐 Mode: ${
    isTestnetMode ? "🧪 TESTNET" : "📡 MAINNET"
  }`
);

function getChainConfigs() {
  if (isTestnetMode) {
    return {
      ethereum: {
        name: "Ethereum Sepolia",
        chainId: 11155111,
        rpcUrl: process.env.ETH_RPC,
        usdThreshold: 1, // Lower threshold for testnet
        nativeUsdThreshold: 10, // Lower native token threshold for testnet
        pollInterval: 30000, // Longer interval for testnet
        testnet: true,
      },
      polygon: {
        name: "Polygon Amoy",
        chainId: 80002,
        rpcUrl: process.env.POLYGON_RPC,
        usdThreshold: 1,
        pollInterval: 30000,
        testnet: true,
      },
      mantle: {
        name: "Mantle Testnet",
        chainId: 5003,
        rpcUrl: process.env.MANTLE_RPC,
        usdThreshold: 1,
        nativeUsdThreshold: 10, // Lower native token threshold for testnet
        pollInterval: 30000,
        testnet: true,
      },
    };
  }

  // Mainnet configuration
  return {
    ethereum: {
      name: "Ethereum",
      chainId: 1,
      rpcUrl: process.env.ETH_RPC,
      usdThreshold: 5,
      pollInterval: 20000,
      testnet: false,
    },
    polygon: {
      name: "Polygon",
      chainId: 137,
      rpcUrl: process.env.POLYGON_RPC,
      usdThreshold: 5,
      pollInterval: 20000,
      testnet: false,
    },
    mantle: {
      name: "Mantle",
      chainId: 5000,
      rpcUrl: process.env.MANTLE_RPC,
      usdThreshold: 5,
      pollInterval: 20000,
      testnet: false,
    },
  };
}

const chains = getChainConfigs();

// --- Startup message ---
console.log(`🤖 Telegram Sweeper Bot starting...`);
console.log(`🌐 Mode: ${isTestnetMode ? "🧪 TESTNET" : "📡 MAINNET"}`);
console.log(`📋 Available chains:`, Object.keys(chains).join(", "));

// --- Runtime vars ---
let mnemonic = null;
let destAddress = process.env.DEST_ADDRESS || null;

// --- Commands ---
bot.onText(/^\/help$/, (msg) => {
  if (msg.chat.id.toString() !== CHAT_ID) return;

  const modeInfo = isTestnetMode ? "🧪 TESTNET MODE" : "📡 MAINNET MODE";
  const availableChains = Object.entries(chains)
    .map(([key, config]) => `• ${key} (${config.name})`)
    .join("\n");

  const helpText = `
🤖 **Auto Sweep Bot Commands**

🌐 **Current Mode:** ${modeInfo}

**Setup Commands:**
/setwallet <mnemonic> - Set wallet to monitor
/settarget <address> - Set destination address

**Control Commands:**
/enable <chain> - Start sweeping on a chain
/disable - Stop all sweepers
/status - Check current status

**Discovery Commands:**
/discover <chain> - Check balances on a chain

**Available Chains:**
${availableChains}

${
  isTestnetMode
    ? "⚠️ **TESTNET MODE** - Using test networks with lower thresholds"
    : "⚠️ **MAINNET MODE** - Using real networks, be careful!"
}
  `.trim();

  bot.sendMessage(msg.chat.id, helpText, { parse_mode: "Markdown" });
});

bot.onText(/^\/setwallet (.+)/, (msg, match) => {
  if (msg.chat.id.toString() !== CHAT_ID) return;
  const phrase = match[1].trim();
  if (!ethers.Mnemonic.isValidMnemonic(phrase)) {
    return bot.sendMessage(msg.chat.id, "❌ Invalid mnemonic");
  }
  mnemonic = phrase;
  bot.sendMessage(msg.chat.id, "✅ Wallet set. Now use /settarget <address>");
});

bot.onText(/^\/settarget (.+)/, (msg, match) => {
  if (msg.chat.id.toString() !== CHAT_ID) return;
  const address = match[1].trim();
  if (!ethers.isAddress(address)) {
    return bot.sendMessage(msg.chat.id, "❌ Invalid address");
  }
  destAddress = address;
  bot.sendMessage(msg.chat.id, `🎯 Destination set: ${destAddress}`);
});

bot.onText(/^\/enable (.+)/, (msg, match) => {
  if (msg.chat.id.toString() !== CHAT_ID) return;
  if (!mnemonic) return bot.sendMessage(msg.chat.id, "⚠️ No wallet set.");
  if (!destAddress)
    return bot.sendMessage(msg.chat.id, "⚠️ No destination set.");

  const chainKey = match[1].toLowerCase();
  const config = chains[chainKey];
  if (!config)
    return bot.sendMessage(msg.chat.id, `❌ Unknown chain: ${chainKey}`);

  if (runningSweepers[chainKey]) {
    return bot.sendMessage(msg.chat.id, `⚠️ Already running on ${config.name}`);
  }

  startSweeper(chainKey, config, mnemonic, destAddress, (event) =>
    bot.sendMessage(msg.chat.id, event)
  );
});

bot.onText(/^\/disable$/, (msg) => {
  if (msg.chat.id.toString() !== CHAT_ID) return;
  stopAllSweepers();
  bot.sendMessage(msg.chat.id, "🛑 All sweepers stopped.");
});

bot.onText(/^\/status$/, (msg) => {
  if (msg.chat.id.toString() !== CHAT_ID) return;
  const statuses = Object.entries(chains)
    .map(([key, c]) => {
      return `${c.name}: ${runningSweepers[key] ? "🟢 Running" : "🔴 Stopped"}`;
    })
    .join("\n");

  const modeInfo = isTestnetMode ? "🧪 TESTNET MODE" : "📡 MAINNET MODE";

  bot.sendMessage(
    msg.chat.id,
    `📊 Sweeper Status:\n\n🌐 Mode: ${modeInfo}\n🎯 Destination: ${
      destAddress || "❌ Not set"
    }\n\n${statuses}`
  );
});

bot.onText(/^\/discover (.+)/, async (msg, match) => {
  if (msg.chat.id.toString() !== CHAT_ID) return;
  if (!mnemonic) return bot.sendMessage(msg.chat.id, "⚠️ No wallet set.");

  const chainKey = match[1].toLowerCase();
  const config = chains[chainKey];
  if (!config)
    return bot.sendMessage(msg.chat.id, `❌ Unknown chain: ${chainKey}`);

  try {
    const wallet = getWalletFromMnemonic(mnemonic, chainKey);

    // Native balance - use proper formatting for each chain
    const nativeBalance = await wallet.provider.getBalance(wallet.address);
    const nativeInfo = formatNativeBalance(chainKey, nativeBalance);

    // ERC20 balances
    const tokens = await getTokenBalances(chainKey, wallet.address);

    const modeIndicator = isTestnetMode ? "🧪" : "📡";
    let reply = `🔎 ${modeIndicator} Balances on ${config.name} for ${wallet.address}:\n\n`;

    reply += `• ${nativeInfo.formatted} ${nativeInfo.symbol} (native)\n`;

    if (tokens.length) {
      tokens.forEach((t) => {
        const formatted = ethers.formatUnits(t.balance, t.decimals);
        reply += `• ${formatted} ${t.symbol} (${t.contract.substring(
          0,
          8
        )}...)\n`;
      });
    } else {
      reply += `\n(no ERC-20 tokens found with non-zero balance)`;
    }

    bot.sendMessage(msg.chat.id, reply);
  } catch (err) {
    bot.sendMessage(
      msg.chat.id,
      `❌ Error discovering tokens on ${config.name}: ${err.message}`
    );
  }
});
