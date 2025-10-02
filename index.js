const TelegramBot = require("node-telegram-bot-api");
const { ethers } = require("ethers");
require("dotenv").config();

const { getUserManager } = require("./user-manager");
const { getMultiUserSweeper } = require("./multi-user-sweeper");

const {
  getWalletFromMnemonic,
  getTokenBalances,
  isTestnetMode,
  formatNativeBalance,
} = require("./wallet-utils");

const BOT_TOKEN = process.env.BOT_TOKEN;
const MAX_USERS = parseInt(process.env.MAX_USERS) || 3;

const bot = new TelegramBot(BOT_TOKEN, { polling: true });
const userManager = getUserManager();
const multiUserSweeper = getMultiUserSweeper();

// Send startup message
console.log("🎉 Simplified Auto-Sweep Bot is starting...");
console.log(`👥 Maximum users allowed: ${MAX_USERS}`);
console.log(
  `🌐 Running in: ${
    isTestnetMode
      ? "🧪 Safe Test Mode (practice with fake money)"
      : "📡 Live Mode (real cryptocurrency)"
  }`
);

const chainNames = Object.values(getChainConfigs()).map((config) =>
  config.name.replace(" Sepolia", "").replace(" Amoy", "")
);
console.log(`💎 Ready to help with: ${chainNames.join(", ")}`);

// --- Chain configs based on TEST_MODE ---
function getChainConfigs() {
  if (isTestnetMode) {
    return {
      ethereum: {
        name: "Ethereum Sepolia",
        chainId: 11155111,
        rpcUrl: process.env.ETH_RPC,
        usdThreshold: 1,
        nativeUsdThreshold: 5,
        pollInterval: 5000,
        testnet: true,
      },
      mantle: {
        name: "Mantle Sepolia",
        chainId: 5003,
        usdThreshold: 0.1,
        nativeUsdThreshold: 0.1,
        pollInterval: 5000,
        testnet: true,
      },
    };
  }

  return {
    ethereum: {
      name: "Ethereum",
      chainId: 1,
      rpcUrl: process.env.ETH_RPC,
      usdThreshold: 70,
      nativeUsdThreshold: 70,
      pollInterval: 5000,
      testnet: false,
    },
    mantle: {
      name: "Mantle",
      chainId: 5000,
      usdThreshold: 70,
      nativeUsdThreshold: 70,
      pollInterval: 5000,
      testnet: false,
    },
  };
}

const chains = getChainConfigs();

// --- Helper functions ---
async function ensureUserRegistered(userId) {
  let userData = userManager.getUserData(userId);
  if (!userData) {
    if (!userManager.canRegisterNewUser()) {
      throw new Error(
        `Sorry! The bot has reached its maximum capacity of ${MAX_USERS} users. Please try again later.`
      );
    }
    userData = await userManager.registerUser(userId);
  }
  userManager.updateUserActivity(userId);
  return userData;
}

// Helper function to detect if a message is a mnemonic phrase
function detectMnemonic(text) {
  const words = text.trim().split(/\s+/);
  // Check if it's 12 or 24 words and is a valid mnemonic
  if (
    (words.length === 12 || words.length === 24) &&
    ethers.Mnemonic.isValidMnemonic(text.trim())
  ) {
    return text.trim();
  }
  return null;
}

// Helper function to detect if a message is a wallet address
function detectWalletAddress(text) {
  const trimmed = text.trim();
  if (ethers.isAddress(trimmed)) {
    return trimmed;
  }
  return null;
}

// Helper function to start sweepers on all chains
function startSweeperForAllChains(userId, mnemonic, destAddress) {
  const chainKeys = Object.keys(chains);
  const startedChains = [];
  const failedChains = [];

  for (const chainKey of chainKeys) {
    try {
      const config = chains[chainKey];
      const success = multiUserSweeper.startSweeperForUser(
        userId,
        chainKey,
        config,
        mnemonic,
        destAddress,
        (msg) => bot.sendMessage(userId, msg)
      );

      if (success) {
        startedChains.push(
          config.name.replace(" Sepolia", "").replace(" Amoy", "")
        );
      } else {
        failedChains.push(
          config.name.replace(" Sepolia", "").replace(" Amoy", "")
        );
      }
    } catch (error) {
      console.error(`Failed to start sweeper on ${chainKey}:`, error);
      failedChains.push(
        chains[chainKey].name.replace(" Sepolia", "").replace(" Amoy", "")
      );
    }
  }

  return { startedChains, failedChains };
}

// Helper function to stop sweepers on all chains
function stopSweeperForAllChains(userId) {
  return multiUserSweeper.stopAllSweepersForUser(userId);
}

// Helper function to get status across all chains
function getMultiChainStatus(userId) {
  const chainKeys = Object.keys(chains);
  const statusByChain = {};

  for (const chainKey of chainKeys) {
    const config = chains[chainKey];
    const friendlyName = config.name
      .replace(" Sepolia", "")
      .replace(" Amoy", "");
    const isActive = multiUserSweeper.getUserSweeperStatus(userId, chainKey);
    statusByChain[friendlyName] = isActive;
  }

  return statusByChain;
}

// Helper function to check balances across all chains
async function checkBalancesAllChains(mnemonic) {
  const chainKeys = Object.keys(chains);
  const balancesByChain = {};

  for (const chainKey of chainKeys) {
    try {
      const config = chains[chainKey];
      const friendlyName = config.name
        .replace(" Sepolia", "")
        .replace(" Amoy", "");

      const wallet = getWalletFromMnemonic(mnemonic, chainKey);
      const nativeBalance = await wallet.provider.getBalance(wallet.address);
      const tokens = await getTokenBalances(chainKey, wallet.address);

      const nativeInfo = formatNativeBalance(chainKey, nativeBalance);

      balancesByChain[friendlyName] = {
        native: nativeInfo,
        tokens: tokens,
        chainKey: chainKey,
      };
    } catch (error) {
      console.error(`Failed to check balance on ${chainKey}:`, error);
      const friendlyName = chains[chainKey].name
        .replace(" Sepolia", "")
        .replace(" Amoy", "");
      balancesByChain[friendlyName] = {
        error: error.message,
        chainKey: chainKey,
      };
    }
  }

  return balancesByChain;
}

// --- Simplified Commands ---

// /help command
bot.onText(/^\/help$/, async (msg) => {
  const userId = msg.chat.id.toString();

  try {
    await ensureUserRegistered(userId);
  } catch (error) {
    return bot.sendMessage(msg.chat.id, `❌ ${error.message}`);
  }

  const modeInfo = isTestnetMode
    ? "🧪 Test Mode (Practice with fake money)"
    : "📡 Live Mode (Real cryptocurrency)";

  const helpText = `
🌟 <b>Simple Auto-Sweep Bot</b>

${isTestnetMode ? "🛡️" : "⚠️"} <b>Mode:</b> ${modeInfo}

<b>� Commands:</b>
• <code>/help</code> - Show this help message
• <code>/start</code> - Start auto-sweeping (needs wallet & destination)
• <code>/stop</code> - Stop all auto-sweeping
• <code>/status</code> - Check current status
• <code>/balance</code> - Check your wallet balance

<b>� Quick Setup:</b>
1. Send me your mnemonic phrase (12 or 24 words)
2. Send me your destination wallet address (0x...)
3. Use <code>/start</code> to begin auto-sweeping

<b>💡 Tips:</b>
• Just paste your recovery phrase and I'll detect it automatically
• Just paste a wallet address and I'll set it as your destination
• Everything is automatic - no complex commands needed!

${
  isTestnetMode
    ? "🛡️ <b>Safe Mode</b>: Perfect for learning without risk!"
    : "⚠️ <b>Live Mode</b>: Real cryptocurrency - double-check everything!"
}
`.trim();

  bot.sendMessage(msg.chat.id, helpText, { parse_mode: "HTML" });
});

// /start command
bot.onText(/^\/start$/, async (msg) => {
  const userId = msg.chat.id.toString();

  try {
    await ensureUserRegistered(userId);
  } catch (error) {
    return bot.sendMessage(msg.chat.id, `❌ ${error.message}`);
  }

  const userData = userManager.getUserData(userId);
  const mnemonic = userManager.getUserMnemonic(userId);

  if (!mnemonic) {
    return bot.sendMessage(
      msg.chat.id,
      "🔐 Please send me your seed phrase first!\n\n💡 Just paste your 12 or 24 word recovery phrase and I'll detect it automatically."
    );
  }

  if (!userData.destAddress) {
    return bot.sendMessage(
      msg.chat.id,
      "🎯 Please send me your destination wallet address first!\n\n💡 Just paste your wallet address (starting with 0x...) and I'll set it automatically."
    );
  }

  // Check if any sweepers are already running
  const statusByChain = getMultiChainStatus(userId);
  const activeChains = Object.entries(statusByChain)
    .filter(([_, isActive]) => isActive)
    .map(([chainName, _]) => chainName);

  if (activeChains.length > 0) {
    return bot.sendMessage(
      msg.chat.id,
      `✅ Auto-sweepers are already running on: ${activeChains.join(
        ", "
      )}\n\nUse /status to check details.`
    );
  }

  bot.sendMessage(
    msg.chat.id,
    `🚀 Starting auto-sweepers on all supported chains!\n\n🔍 I'll monitor your wallets and automatically sweep any funds to your destination address.\n💫 You'll get notified when funds are moved.`
  );

  const { startedChains, failedChains } = startSweeperForAllChains(
    userId,
    mnemonic,
    userData.destAddress
  );

  let statusMessage = "";
  if (startedChains.length > 0) {
    statusMessage += `✅ Successfully started on: ${startedChains.join(", ")}`;
  }

  if (failedChains.length > 0) {
    if (statusMessage) statusMessage += "\n";
    statusMessage += `⚠️ Failed to start on: ${failedChains.join(", ")}`;
  }

  if (statusMessage) {
    bot.sendMessage(msg.chat.id, statusMessage);
  }
});

// /stop command
bot.onText(/^\/stop$/, async (msg) => {
  const userId = msg.chat.id.toString();

  try {
    await ensureUserRegistered(userId);
  } catch (error) {
    return bot.sendMessage(msg.chat.id, `❌ ${error.message}`);
  }

  const statusByChain = getMultiChainStatus(userId);
  const activeChains = Object.entries(statusByChain)
    .filter(([_, isActive]) => isActive)
    .map(([chainName, _]) => chainName);

  const stoppedCount = stopSweeperForAllChains(userId);

  if (activeChains.length > 0) {
    bot.sendMessage(
      msg.chat.id,
      `✋ Auto-sweepers stopped on: ${activeChains.join(
        ", "
      )}\n\n💤 Your funds are safe - I've just paused the automatic sweeping on all chains.`
    );
  } else {
    bot.sendMessage(
      msg.chat.id,
      "😊 No auto-sweepers were running. Everything is already stopped!"
    );
  }
});

// /status command
bot.onText(/^\/status$/, async (msg) => {
  const userId = msg.chat.id.toString();

  try {
    await ensureUserRegistered(userId);
  } catch (error) {
    return bot.sendMessage(msg.chat.id, `❌ ${error.message}`);
  }

  const userData = userManager.getUserData(userId);
  const mnemonic = userManager.getUserMnemonic(userId);

  const statusByChain = getMultiChainStatus(userId);
  const modeInfo = isTestnetMode ? "🧪 Test Mode" : "📡 Live Mode";

  const walletStatus = mnemonic ? "✅ Connected" : "❌ Not connected";
  const destInfo = userData.destAddress
    ? `✅ ${userData.destAddress.substring(
        0,
        6
      )}...${userData.destAddress.substring(userData.destAddress.length - 4)}`
    : "❌ Not set";

  // Build chain status string
  let chainStatusText = "";
  for (const [chainName, isActive] of Object.entries(statusByChain)) {
    const status = isActive ? "🟢 Running" : "⏸️ Stopped";
    chainStatusText += `⚡ <b>${chainName} Sweeper:</b> ${status}\n`;
  }

  const activeCount = Object.values(statusByChain).filter(Boolean).length;
  const totalCount = Object.keys(statusByChain).length;

  const statusText = `
📊 <b>Multi-Chain Auto-Sweeper Status</b>

🌐 <b>Mode:</b> ${modeInfo}
🔐 <b>Wallet:</b> ${walletStatus}
🎯 <b>Destination:</b> ${destInfo}

<b>Chain Status (${activeCount}/${totalCount} active):</b>
${chainStatusText}
${!mnemonic ? "\n💡 Send your mnemonic phrase to connect wallet" : ""}
${!userData.destAddress ? "\n💡 Send a wallet address to set destination" : ""}
${
  mnemonic && userData.destAddress && activeCount === 0
    ? "\n💡 Use /start to begin auto-sweeping on all chains"
    : ""
}
`.trim();

  bot.sendMessage(msg.chat.id, statusText, { parse_mode: "HTML" });
});

// /balance command
bot.onText(/^\/balance$/, async (msg) => {
  const userId = msg.chat.id.toString();

  try {
    await ensureUserRegistered(userId);
  } catch (error) {
    return bot.sendMessage(msg.chat.id, `❌ ${error.message}`);
  }

  const mnemonic = userManager.getUserMnemonic(userId);
  if (!mnemonic) {
    return bot.sendMessage(
      msg.chat.id,
      "🔐 Please send me your seed phrase first!\n\n💡 Just paste your 12 or 24 word recovery phrase and I'll detect it automatically."
    );
  }

  try {
    bot.sendMessage(
      msg.chat.id,
      `🔍 Checking your balances across all chains...`
    );

    const balancesByChain = await checkBalancesAllChains(mnemonic);
    const modeIndicator = isTestnetMode ? "🧪" : "📡";

    // Get first wallet address (same across all chains)
    const firstChainKey = Object.keys(chains)[0];
    const wallet = getWalletFromMnemonic(mnemonic, firstChainKey);
    const shortAddress = `${wallet.address.substring(
      0,
      6
    )}...${wallet.address.substring(wallet.address.length - 4)}`;

    let reply = `${modeIndicator} <b>Your Multi-Chain Wallet</b>\n\n📍 <b>Address:</b> <code>${shortAddress}</code>\n\n`;

    // Display balances for each chain
    for (const [chainName, chainData] of Object.entries(balancesByChain)) {
      if (chainData.error) {
        reply += `🔴 <b>${chainName}:</b> Error - ${chainData.error}\n\n`;
        continue;
      }

      reply += `💎 <b>${chainName} Balances:</b>\n`;
      reply += `💠 ${chainData.native.formatted} ${chainData.native.symbol}\n`;

      if (chainData.tokens.length > 0) {
        chainData.tokens.forEach((token) => {
          const formatted = ethers.formatUnits(token.balance, token.decimals);
          reply += `🪙 ${formatted} ${token.symbol}\n`;
        });
      } else {
        reply += `😊 No tokens found\n`;
      }
      reply += `\n`;
    }

    if (isTestnetMode) {
      reply += `\n🛡️ Test mode - these aren't real funds`;
    }

    bot.sendMessage(msg.chat.id, reply, { parse_mode: "HTML" });
  } catch (err) {
    bot.sendMessage(
      msg.chat.id,
      `😔 Error checking balances: ${err.message}\n\n💡 Try again in a moment!`
    );
  }
});

// /help command
bot.onText(/^\/help$/, (msg) => {
  const chainNames = Object.values(chains).map((config) =>
    config.name.replace(" Sepolia", "").replace(" Amoy", "")
  );

  const helpText = `
🤖 <b>Multi-Chain Auto-Sweep Bot</b>

🌐 <b>Supported Chains:</b>
${chainNames.map((name) => `• ${name}`).join("\n")}

📋 <b>Commands:</b>

🚀 /start - Start auto-sweeping on ALL chains
✋ /stop - Stop auto-sweeping on all chains  
📊 /status - Check sweeper status across all chains
💰 /balance - View balances on all chains
❓ /help - Show this help message

🔧 <b>Setup:</b>
1️⃣ Send your 12-24 word recovery phrase
2️⃣ Send your destination wallet address (0x...)
3️⃣ Use /start to begin monitoring

🛡️ <b>Security:</b>
• Your seed phrase is encrypted and stored locally
• Funds are automatically swept to your chosen destination
• You'll get notifications for every successful sweep

${
  isTestnetMode
    ? "🧪 <b>Currently in Test Mode</b> - Safe for practice!"
    : "📡 <b>Live Mode</b> - Real cryptocurrency"
}
  `.trim();

  bot.sendMessage(msg.chat.id, helpText, { parse_mode: "HTML" });
});

// Automatic message detection for mnemonic phrases and wallet addresses
bot.on("message", async (msg) => {
  const text = msg.text;
  if (!text || text.startsWith("/")) return;

  const userId = msg.chat.id.toString();

  try {
    await ensureUserRegistered(userId);
  } catch (error) {
    return bot.sendMessage(msg.chat.id, `❌ ${error.message}`);
  }

  // Check if message contains a mnemonic phrase
  const detectedMnemonic = detectMnemonic(text);
  if (detectedMnemonic) {
    try {
      await userManager.setUserMnemonic(userId, detectedMnemonic);
      const userData = userManager.getUserData(userId);

      let response =
        "🎉 Great! I've detected and connected your wallet securely!\n\n 🔒 Your recovery phrase is safely stored and encrypted.";

      if (!userData.destAddress) {
        response +=
          "\n\n👉 Next: Send me your destination wallet address (0x...) and I'll set it automatically.";
      } else {
        response += "\n\n✅ You're all set! Use /start to begin auto-sweeping.";
      }

      bot.sendMessage(msg.chat.id, response);
      return;
    } catch (error) {
      bot.sendMessage(msg.chat.id, `❌ Error saving wallet: ${error.message}`);
      return;
    }
  }

  // Check if message contains a wallet address
  const detectedAddress = detectWalletAddress(text);
  if (detectedAddress) {
    try {
      await userManager.setUserDestAddress(userId, detectedAddress);
      const userData = userManager.getUserData(userId);
      const mnemonic = userManager.getUserMnemonic(userId);

      const shortAddress = `${detectedAddress.substring(
        0,
        6
      )}...${detectedAddress.substring(detectedAddress.length - 4)}`;

      let response = `🎯 Perfect! I've set your destination wallet to: ${shortAddress}`;

      if (!mnemonic) {
        response +=
          "\n\n👉 Next: Send me your mnemonic phrase (12 or 24 words) and I'll connect your wallet automatically.";
      } else {
        response += "\n\n✅ Setup complete! Use /start to begin auto-sweeping.";
      }

      bot.sendMessage(msg.chat.id, response);
      return;
    } catch (error) {
      bot.sendMessage(
        msg.chat.id,
        `❌ Error saving destination: ${error.message}`
      );
      return;
    }
  }

  // Handle common questions and phrases for non-command messages
  const lowerText = text.toLowerCase();
  if (
    lowerText.includes("help") ||
    lowerText.includes("what") ||
    lowerText.includes("how")
  ) {
    bot.sendMessage(
      msg.chat.id,
      "👋 Hi! I'm your simple auto-sweep bot!\n\n🌟 Use /help to see all commands, or just:\n• Send your mnemonic phrase (12-24 words)\n• Send your destination wallet address (0x...)\n• Use /start to begin auto-sweeping!"
    );
  } else if (
    lowerText.includes("balance") ||
    lowerText.includes("funds") ||
    lowerText.includes("money")
  ) {
    bot.sendMessage(
      msg.chat.id,
      "💰 Use /balance to check your wallet balance!"
    );
  } else if (
    lowerText.includes("start") ||
    lowerText.includes("begin") ||
    lowerText.includes("sweep")
  ) {
    bot.sendMessage(
      msg.chat.id,
      "🚀 Use /start to begin auto-sweeping!\n\n💡 Make sure you've sent me your mnemonic phrase and destination address first."
    );
  } else if (lowerText.includes("stop") || lowerText.includes("pause")) {
    bot.sendMessage(
      msg.chat.id,
      "✋ Use /stop to stop auto-sweeping\n\nUse /status to check what's currently running."
    );
  } else {
    // For unrecognized messages, provide helpful guidance
    bot.sendMessage(
      msg.chat.id,
      "🤔 I didn't recognize that. Here's what I can detect automatically:\n\n• Mnemonic phrases (12-24 words)\n• Wallet addresses (0x...)\n\nOr use /help to see all commands!"
    );
  }
});

console.log("✅ Simplified auto-sweep bot is ready and listening!");
