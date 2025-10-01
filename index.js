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
console.log(`💎 Ready to help with: Ethereum`);

// --- Chain configs based on TEST_MODE ---
function getChainConfigs() {
  if (isTestnetMode) {
    return {
      ethereum: {
        name: "Ethereum Sepolia",
        chainId: 11155111,
        rpcUrl: process.env.ETH_RPC,
        usdThreshold: 1,
        nativeUsdThreshold: 10,
        pollInterval: 30000,
        testnet: true,
      },
    };
  }

  return {
    ethereum: {
      name: "Ethereum",
      chainId: 1,
      rpcUrl: process.env.ETH_RPC,
      usdThreshold: 10,
      nativeUsdThreshold: 5,
      pollInterval: 20000,
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

  const chainKey = "ethereum";
  const config = chains[chainKey];

  if (multiUserSweeper.getUserSweeperStatus(userId, chainKey)) {
    return bot.sendMessage(
      msg.chat.id,
      `✅ Auto-sweeper is already running on ${config.name}!\n\nUse /status to check details.`
    );
  }

  bot.sendMessage(
    msg.chat.id,
    `🚀 Starting auto-sweeper on ${config.name}!\n\n🔍 I'll monitor your wallet and automatically sweep any funds to your destination address.\n💫 You'll get notified when funds are moved.`
  );

  multiUserSweeper.startSweeperForUser(
    userId,
    chainKey,
    config,
    mnemonic,
    userData.destAddress,
    (event) => bot.sendMessage(msg.chat.id, event)
  );
});

// /stop command
bot.onText(/^\/stop$/, async (msg) => {
  const userId = msg.chat.id.toString();

  try {
    await ensureUserRegistered(userId);
  } catch (error) {
    return bot.sendMessage(msg.chat.id, `❌ ${error.message}`);
  }

  const activeSweepers = multiUserSweeper.getUserActiveSweepers(userId);
  const activeCount = activeSweepers.length;

  multiUserSweeper.stopAllSweepersForUser(userId);

  if (activeCount > 0) {
    bot.sendMessage(
      msg.chat.id,
      `✋ Auto-sweeper stopped!\n\n💤 Your funds are safe - I've just paused the automatic sweeping.`
    );
  } else {
    bot.sendMessage(
      msg.chat.id,
      "😊 No auto-sweeper was running. Everything is already stopped!"
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
  const chainKey = "ethereum";
  const config = chains[chainKey];

  const status = multiUserSweeper.getUserSweeperStatus(userId, chainKey)
    ? "🟢 Running"
    : "⏸️ Stopped";

  const modeInfo = isTestnetMode ? "🧪 Test Mode" : "📡 Live Mode";

  const walletStatus = mnemonic ? "✅ Connected" : "❌ Not connected";
  const destInfo = userData.destAddress
    ? `✅ ${userData.destAddress.substring(
        0,
        6
      )}...${userData.destAddress.substring(userData.destAddress.length - 4)}`
    : "❌ Not set";

  const statusText = `
📊 <b>Auto-Sweeper Status</b>

🌐 <b>Mode:</b> ${modeInfo}
� <b>Wallet:</b> ${walletStatus}
🎯 <b>Destination:</b> ${destInfo}
⚡ <b>Ethereum Sweeper:</b> ${status}

${!mnemonic ? "\n💡 Send your mnemonic phrase to connect wallet" : ""}
${!userData.destAddress ? "\n💡 Send a wallet address to set destination" : ""}
${
  mnemonic &&
  userData.destAddress &&
  !multiUserSweeper.getUserSweeperStatus(userId, chainKey)
    ? "\n💡 Use /start to begin auto-sweeping"
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

  const chainKey = "ethereum";
  const config = chains[chainKey];

  try {
    bot.sendMessage(msg.chat.id, `🔍 Checking your ${config.name} balance...`);

    const wallet = getWalletFromMnemonic(mnemonic, chainKey);
    const nativeBalance = await wallet.provider.getBalance(wallet.address);
    const nativeInfo = formatNativeBalance(chainKey, nativeBalance);
    const tokens = await getTokenBalances(chainKey, wallet.address);

    const modeIndicator = isTestnetMode ? "🧪" : "📡";
    const shortAddress = `${wallet.address.substring(
      0,
      6
    )}...${wallet.address.substring(wallet.address.length - 4)}`;

    let reply = `${modeIndicator} <b>Your ${config.name} Wallet</b>\n\n📍 <b>Address:</b> <code>${shortAddress}</code>\n\n💎 <b>Balances:</b>\n\n`;

    reply += `💠 ${nativeInfo.formatted} ${nativeInfo.symbol}\n`;

    if (tokens.length) {
      tokens.forEach((t) => {
        const formatted = ethers.formatUnits(t.balance, t.decimals);
        reply += `🪙 ${formatted} ${t.symbol}\n`;
      });
    } else {
      reply += `\n😊 No tokens found`;
    }

    if (isTestnetMode) {
      reply += `\n\n🛡️ Test mode - these aren't real funds`;
    }

    bot.sendMessage(msg.chat.id, reply, { parse_mode: "HTML" });
  } catch (err) {
    bot.sendMessage(
      msg.chat.id,
      `😔 Error checking balance: ${err.message}\n\n💡 Try again in a moment!`
    );
  }
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
