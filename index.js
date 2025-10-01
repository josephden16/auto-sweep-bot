const TelegramBot = require("node-telegram-bot-api");
const { ethers } = require("ethers");
require("dotenv").config();

const { startSweeper, stopAllSweepers, runningSweepers } = require("./sweeper");

const {
  getWalletFromMnemonic,
  getTokenBalances,
  isTestnetMode,
  formatNativeBalance,
} = require("./wallet-utils");

const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// --- Chain configs based on TEST_MODE ---

// Send startup message to Telegram
bot.sendMessage(
  CHAT_ID,
  `🎉 Welcome! Your Ethereum auto-sweep bot is ready to help!\n🌐 Running in ${
    isTestnetMode
      ? "🧪 Test Mode (safe for learning)"
      : "📡 Live Mode (real money)"
  }\n\nType /help to get started! 💫`
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
      // polygon: {
      //   name: "Polygon Amoy",
      //   chainId: 80002,
      //   rpcUrl: process.env.POLYGON_RPC,
      //   nativeUsdThreshold: 10, // Lower native token threshold for testnet
      //   usdThreshold: 1,
      //   pollInterval: 30000,
      //   testnet: true,
      // },
      // mantle: {
      //   name: "Mantle Testnet",
      //   chainId: 5003,
      //   rpcUrl: process.env.MANTLE_RPC,
      //   usdThreshold: 1,
      //   nativeUsdThreshold: 10, // Lower native token threshold for testnet
      //   pollInterval: 30000,
      //   testnet: true,
      // },
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
    // polygon: {
    //   name: "Polygon",
    //   chainId: 137,
    //   rpcUrl: process.env.POLYGON_RPC,
    //   nativeUsdThreshold: 20,
    //   usdThreshold: 5,
    //   pollInterval: 20000,
    //   testnet: false,
    // },
    // mantle: {
    //   name: "Mantle",
    //   chainId: 5000,
    //   rpcUrl: process.env.MANTLE_RPC,
    //   nativeUsdThreshold: 20,
    //   usdThreshold: 5,
    //   pollInterval: 20000,
    //   testnet: false,
    // },
  };
}

const chains = getChainConfigs();

// --- Startup message ---
console.log(`🌟 Your Auto-Sweep Assistant is starting up...`);
console.log(
  `🌐 Running in: ${
    isTestnetMode
      ? "🧪 Safe Test Mode (practice with fake money)"
      : "📡 Live Mode (real cryptocurrency)"
  }`
);
console.log(`💎 Ready to help with: Ethereum`);

// --- Runtime vars ---
let mnemonic = null;
let destAddress = process.env.DEST_ADDRESS || null;

// --- Commands ---

bot.onText(/^\/help$/, (msg) => {
  if (msg.chat.id.toString() !== CHAT_ID) return;

  const modeInfo = isTestnetMode
    ? "🧪 Test Mode (Practice with fake money)"
    : "📡 Live Mode (Real cryptocurrency)";

  // HTML-escape helper (important!)
  const escapeHtml = (str) =>
    String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

  const availableChains = Object.entries(chains)
    .map(
      ([, config]) =>
        "• " +
        escapeHtml(
          config.name
            .replace(" Testnet", "")
            .replace(" Sepolia", "")
            .replace(" Amoy", "")
        )
    )
    .join("\n");

  const helpText = [
    "🌟 <b>Welcome to Your Auto-Sweep Assistant!</b>",
    "",
    "I help you automatically collect and organize your Ethereum crypto.",
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
    "<code>/stop_all</code> - Stop all collection activities",
    "<code>/check_status</code> - See what's currently running",
    "",
    "🔍 <b>Explore Your Funds:</b>",
    "<code>/check_balance</code> - See your Ethereum funds",
    "",
    "<b>� Blockchain:</b> Ethereum",
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
      // If HTML fails, log and send a plain-text fallback
      console.error(
        "Failed to send help (HTML). Falling back to plain text:",
        err
      );

      // Strip HTML tags and unescape entities for fallback
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
bot.onText(/^\/setup$/, (msg) => {
  if (msg.chat.id.toString() !== CHAT_ID) return;

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

bot.onText(/^\/connect_wallet (.+)/, (msg, match) => {
  if (msg.chat.id.toString() !== CHAT_ID) return;
  const phrase = match[1].trim();
  if (!ethers.Mnemonic.isValidMnemonic(phrase)) {
    return bot.sendMessage(
      msg.chat.id,
      "🤔 Hmm, that doesn't look like a valid recovery phrase. Please check and try again!\n\n💡 Tip: Recovery phrases are usually 12 or 24 words separated by spaces."
    );
  }
  mnemonic = phrase;
  bot.sendMessage(
    msg.chat.id,
    "🎉 Great! Your wallet is now connected securely!\n\n👉 Next step: Use /set_destination to choose where funds should be sent.\n\n🔒 Your recovery phrase is safely stored and encrypted."
  );
});

bot.onText(/^\/set_destination (.+)/, (msg, match) => {
  if (msg.chat.id.toString() !== CHAT_ID) return;
  const address = match[1].trim();
  if (!ethers.isAddress(address)) {
    return bot.sendMessage(
      msg.chat.id,
      "🤔 That doesn't look like a valid wallet address. Please double-check and try again!\n\n💡 Tip: Wallet addresses start with '0x' and are 42 characters long."
    );
  }
  destAddress = address;
  const shortAddress = `${address.substring(0, 6)}...${address.substring(
    address.length - 4
  )}`;
  bot.sendMessage(
    msg.chat.id,
    `🎯 Perfect! Your destination wallet is set to: ${shortAddress}\n\n✅ Setup complete! You can now start collecting funds with /start_collecting or check your current balance with /check_balance`
  );
});

bot.onText(/^\/start_collecting$/, (msg) => {
  if (msg.chat.id.toString() !== CHAT_ID) return;
  if (!mnemonic)
    return bot.sendMessage(
      msg.chat.id,
      "🔐 Please connect your wallet first using /connect_wallet or /setup"
    );
  if (!destAddress)
    return bot.sendMessage(
      msg.chat.id,
      "💰 Please set your destination wallet first using /set_destination or /setup"
    );

  const chainKey = "ethereum"; // Default to ethereum
  const config = chains[chainKey];

  if (runningSweepers[chainKey]) {
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

  startSweeper(chainKey, config, mnemonic, destAddress, (event) =>
    bot.sendMessage(msg.chat.id, event)
  );
});

bot.onText(/^\/stop_all$/, (msg) => {
  if (msg.chat.id.toString() !== CHAT_ID) return;
  const activeCount = Object.values(runningSweepers).filter(Boolean).length;
  stopAllSweepers();
  if (activeCount > 0) {
    bot.sendMessage(
      msg.chat.id,
      `✋ All collection activities stopped!\n\n💤 Your funds are safe - I've just paused the automatic collecting.`
    );
  } else {
    bot.sendMessage(
      msg.chat.id,
      "🛑 No collection activities were running. Everything is already stopped!"
    );
  }
});

bot.onText(/^\/check_status$/, (msg) => {
  if (msg.chat.id.toString() !== CHAT_ID) return;
  const chainKey = "ethereum";
  const config = chains[chainKey];
  const friendlyName = config.name
    .replace(" Testnet", "")
    .replace(" Sepolia", "")
    .replace(" Amoy", "");

  const status = runningSweepers[chainKey]
    ? "🟢 Actively collecting"
    : "⏸️ Paused";

  const modeInfo = isTestnetMode
    ? "🧪 Test Mode (Practice)"
    : "📡 Live Mode (Real crypto)";
  const destInfo = destAddress
    ? `${destAddress.substring(0, 6)}...${destAddress.substring(
        destAddress.length - 4
      )}`
    : "❌ Not set yet";

  bot.sendMessage(
    msg.chat.id,
    `📊 Your Collection Status:\n\n🌐 Mode: ${modeInfo}\n💰 Funds go to: ${destInfo}\n\n${friendlyName}: ${status}\n\n💡 Use /start_collecting to begin collecting!`
  );
});

bot.onText(/^\/check_balance$/, async (msg) => {
  if (msg.chat.id.toString() !== CHAT_ID) return;
  if (!mnemonic)
    return bot.sendMessage(
      msg.chat.id,
      "🔐 Please connect your wallet first using /connect_wallet or try /setup for a guided experience!"
    );

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

// Legacy command support with helpful redirects
bot.onText(/^\/setwallet/, (msg) => {
  if (msg.chat.id.toString() !== CHAT_ID) return;
  bot.sendMessage(
    msg.chat.id,
    "🔄 Command updated! Please use /connect_wallet instead.\n\n💡 Or try /setup for a guided experience!"
  );
});

bot.onText(/^\/settarget/, (msg) => {
  if (msg.chat.id.toString() !== CHAT_ID) return;
  bot.sendMessage(
    msg.chat.id,
    "🔄 Command updated! Please use /set_destination instead.\n\n💡 Or try /setup for a guided experience!"
  );
});

bot.onText(/^\/enable/, (msg) => {
  if (msg.chat.id.toString() !== CHAT_ID) return;
  bot.sendMessage(
    msg.chat.id,
    "🔄 Command updated! Please use /start_collecting instead."
  );
});

bot.onText(/^\/disable/, (msg) => {
  if (msg.chat.id.toString() !== CHAT_ID) return;
  bot.sendMessage(
    msg.chat.id,
    "🔄 Command updated! Please use /stop_all instead."
  );
});

bot.onText(/^\/status/, (msg) => {
  if (msg.chat.id.toString() !== CHAT_ID) return;
  bot.sendMessage(
    msg.chat.id,
    "🔄 Command updated! Please use /check_status instead."
  );
});

bot.onText(/^\/discover/, (msg) => {
  if (msg.chat.id.toString() !== CHAT_ID) return;
  bot.sendMessage(
    msg.chat.id,
    "🔄 Command updated! Please use /check_balance instead."
  );
});

// Friendly conversation handlers
bot.on("message", (msg) => {
  if (msg.chat.id.toString() !== CHAT_ID) return;

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
      "✋ To stop all collection activities, use /stop_all\n\nTo check what's currently running, use /check_status"
    );
  }
});
