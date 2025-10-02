# 🤖 Auto Sweep Bot

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D16-brightgreen)](https://nodejs.org/)
[![Ethereum](https://img.shields.io/badge/Ethereum-3C3C3D?logo=ethereum&logoColor=white)](https://ethereum.org/)
[![Polygon](https://img.shields.io/badge/Polygon-8247E5?logo=polygon&logoColor=white)](https://polygon.technology/)
[![Telegram](https://img.shields.io/badge/Telegram-2CA5E0?logo=telegram&logoColor=white)](https://telegram.org/)

A powerful Telegram bot that automatically sweeps native tokens and ERC-20 tokens from monitored wallets across multiple blockchain networks when they exceed configurable USD thresholds. Perfect for automated fund management, liquidity harvesting, and portfolio consolidation.

## ✨ Features

- 🌐 **Multi-chain support** - Ethereum, Polygon, Mantle (easily extensible)
- 🔄 **Multi-user support** - Up to 3 concurrent users with individual configurations
- 🎯 **Smart native token handling** - Automatic decimal formatting per chain
- 💰 **Automatic token sweeping** - Both native and ERC-20 tokens
- 💵 **USD threshold filtering** - Only sweep tokens above specified value
- 📱 **Telegram bot interface** - Easy control and monitoring
- 📥 **Smart input detection** - Paste seed phrases and addresses directly (no commands needed)
- 🔔 **Real-time notifications** - Instant alerts with blockchain explorer links
- 🧪 **Testnet mode** - Safe testing environment with test networks
- 🔐 **Secure user management** - Encrypted storage of sensitive data
- 📊 **Comprehensive logging** - Detailed operation logs and status tracking
- ⚡ **Gas optimization** - Smart gas estimation and cost calculation

## 🚀 Quick Start

### Prerequisites

- Node.js 16 or higher
- [Alchemy](https://www.alchemy.com/) API key
- Telegram bot token from [@BotFather](https://t.me/BotFather)

### Installation

1. **Clone the repository**

   ```bash
   git clone https://github.com/yourusername/auto-sweep-bot.git
   cd auto-sweep-bot
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Configure environment**

   ```bash
   cp .env.example .env
   ```

   Edit `.env` with your configuration:

   ```bash
   # Required
   BOT_TOKEN=your_telegram_bot_token
   ALCHEMY_API_KEY=your_alchemy_api_key

   # Optional
   TESTNET_MODE=true              # Enable testnet mode for safe testing
   MAX_USERS=3                    # Maximum concurrent users
   ADMIN_CHAT_ID=your_chat_id     # Admin notifications
   ```

4. **Start the bot**
   ```bash
   npm start
   ```

## 🔧 Configuration

### 🌐 Network Modes

The bot supports both mainnet and testnet configurations:

| Mode        | Networks                        | Thresholds | Purpose        |
| ----------- | ------------------------------- | ---------- | -------------- |
| **Mainnet** | Ethereum, Polygon, Mantle       | $5+ USD    | Production use |
| **Testnet** | Sepolia, Mumbai, Mantle Sepolia | $1+ USD    | Safe testing   |

**Enable testnet mode:**

```bash
TESTNET_MODE=true
```

### 🔑 Getting API Keys

#### Telegram Bot Setup

1. Message [@BotFather](https://t.me/BotFather) on Telegram
2. Create a new bot with `/newbot`
3. Save the bot token to your `.env` file
4. Get your chat ID by messaging [@userinfobot](https://t.me/userinfobot)

#### Alchemy API Key

1. Sign up at [Alchemy](https://www.alchemy.com/)
2. Create a new app
3. Copy the API key to your `.env` file

## 📱 Usage

### Starting the Bot

```bash
npm start
```

For multi-user mode:

```bash
npm run start:multiuser
```

### Telegram Commands

| Command                 | Description                              | Example                         |
| ----------------------- | ---------------------------------------- | ------------------------------- |
| `/help`                 | Show available commands and current mode | `/help`                         |
| `/setwallet <mnemonic>` | Set wallet to monitor (12/24 words)      | `/setwallet abandon abandon...` |
| `/settarget <address>`  | Set destination for swept tokens         | `/settarget 0x1234...`          |
| `/enable <chain>`       | Start sweeping on a chain                | `/enable ethereum`              |
| `/disable`              | Stop all sweepers                        | `/disable`                      |
| `/status`               | Check sweeper status                     | `/status`                       |
| `/discover <chain>`     | Check current balances                   | `/discover polygon`             |

### 📝 Easy Input Mode

**No need to type commands!** The bot supports direct pasting for easier setup:

- **Seed Phrase**: Simply paste your 12 or 24-word mnemonic directly into the chat
- **Wallet Address**: Paste any Ethereum-format address (0x...) to set as destination

The bot automatically detects and processes:

- ✅ Valid mnemonic phrases (12/24 words)
- ✅ Ethereum addresses (42 characters starting with 0x)
- ✅ Smart validation and error handling

**Example Easy Setup:**

```
1. Start bot: /help
2. Paste: abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about
3. Paste: 0x1234567890123456789012345678901234567890
4. Enable: /enable ethereum
```

### Supported Chains

The same chain names work in both mainnet and testnet modes:

- `ethereum` - Ethereum (ETH) / Sepolia
- `polygon` - Polygon (MATIC) / Mumbai
- `mantle` - Mantle (MNT) / Mantle Sepolia

### Example Workflow

**Traditional Command Method:**

```
/help
/setwallet abandon abandon abandon... (your mnemonic)
/settarget 0x1234567890123456789012345678901234567890
/enable ethereum
/enable polygon
/status
```

**Easy Paste Method:**

```
/help
abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about
0x1234567890123456789012345678901234567890
/enable ethereum
/status
```

## 🔔 Notifications

The bot sends real-time Telegram notifications for successful sweeps with direct links to blockchain explorers:

### Example Notifications

**Mainnet:**

```
💰 Swept 1.5 ETH (~$3,750.00) on Ethereum
🔗 https://etherscan.io/tx/0x1234...5678

💰 Swept 1000.0 USDC (~$1,000.00) on Polygon
🔗 https://polygonscan.com/tx/0xabcd...efgh
```

**Testnet:**

```
💰 Swept 0.1 ETH (~$250.00) on Ethereum Sepolia
🔗 https://sepolia.etherscan.io/tx/0x9876...5432

💰 Swept native Mantle Sepolia token
🔗 https://explorer.sepolia.mantle.xyz/tx/0xfeed...beef
```

### Supported Block Explorers

| Network  | Mainnet Explorer                               | Testnet Explorer                                      |
| -------- | ---------------------------------------------- | ----------------------------------------------------- |
| Ethereum | [Etherscan](https://etherscan.io)              | [Sepolia Etherscan](https://sepolia.etherscan.io)     |
| Polygon  | [Polygonscan](https://polygonscan.com)         | [Mumbai Polygonscan](https://mumbai.polygonscan.com)  |
| Mantle   | [Mantle Explorer](https://explorer.mantle.xyz) | [Mantle Sepolia](https://explorer.sepolia.mantle.xyz) |

## ⚙️ Advanced Configuration

### Chain Parameters

Each chain has configurable parameters for fine-tuning:

```javascript
const chains = {
  ethereum: {
    name: "Ethereum",
    chainId: 1,
    usdThreshold: 5, // Only sweep tokens worth $5+ USD
    pollInterval: 20000, // Check every 20 seconds
    nativeSymbol: "ETH",
    nativeDecimals: 18,
    explorerUrl: "https://etherscan.io/tx/",
  },
  // Additional chains...
};
```

### Scripts Available

| Script            | Command                   | Description                         |
| ----------------- | ------------------------- | ----------------------------------- |
| Start Single User | `npm start`               | Run single-user mode                |
| Start Multi-User  | `npm run start:multiuser` | Run multi-user mode (up to 3 users) |
| Development       | `npm run dev`             | Run with auto-restart               |
| Test Multi-User   | `npm run test:multiuser`  | Test multi-user functionality       |

## 🔒 Security Features

- 🔐 **Encrypted storage** - User mnemonics encrypted with AES-256
- 👤 **Multi-user isolation** - Each user's data is completely isolated
- 🛡️ **Admin controls** - Admin-only commands for system management
- 🔑 **Secure key derivation** - Proper HD wallet derivation paths
- 📝 **Audit logs** - All transactions logged for security review

## ⚠️ Security Considerations

**Critical Security Guidelines:**

1. 🔐 **Never share your mnemonic phrase** - Store it securely and never commit to version control
2. 💼 **Use a dedicated wallet** - Don't use your main wallet for sweeping operations
3. 🧪 **Test with small amounts** - Always test with minimal funds first
4. 🔑 **Secure your bot token** - Anyone with access can control the bot
5. 🌍 **Environment variables** - Never hardcode secrets in your code
6. 🔒 **Regular security audits** - Monitor logs and transaction history
7. 📱 **Secure your Telegram** - Enable 2FA on your Telegram account

## 🛠️ How It Works

### Architecture Overview

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Telegram Bot  │◄──►│   User Manager   │◄──►│  Multi-Sweeper  │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                       │                        │
         ▼                       ▼                        ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   User Input    │    │ Encrypted Storage│    │ Blockchain RPCs │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

### Process Flow

1. **👂 Monitoring** - Continuously monitors wallet addresses for new tokens
2. **🔍 Discovery** - Uses Alchemy API to discover ERC-20 token balances
3. **💵 Threshold Check** - Only processes tokens exceeding USD threshold
4. **⛽ Gas Optimization** - Calculates gas costs to ensure profitable sweeps
5. **⚡ Execution** - Transfers tokens to destination address
6. **📨 Notification** - Sends Telegram alerts with transaction links

## 🔧 Troubleshooting

### Common Issues

| Issue                      | Cause                     | Solution                                       |
| -------------------------- | ------------------------- | ---------------------------------------------- |
| `Invalid mnemonic` error   | Incorrect mnemonic format | Ensure 12/24 word phrase is properly formatted |
| `Invalid address` error    | Wrong destination format  | Verify Ethereum address format (0x...)         |
| Gas estimation failures    | Network congestion        | Bot will automatically retry                   |
| Token balance fetch errors | Alchemy API issues        | Usually temporary, will retry automatically    |
| `Maximum users reached`    | User limit exceeded       | Wait for existing user to disconnect           |

### Debug Steps

1. **Check logs**: Review `logs/sweeper.log` for detailed error information
2. **Test network**: Verify Alchemy API key and network connectivity
3. **Validate config**: Ensure all required environment variables are set
4. **Test mode**: Use `TESTNET_MODE=true` for safe testing

## 🌐 Supported Networks

| Network  | Symbol | Chain ID | Testnet        | Testnet Chain ID |
| -------- | ------ | -------- | -------------- | ---------------- |
| Ethereum | ETH    | 1        | Sepolia        | 11155111         |
| Polygon  | MATIC  | 137      | Mumbai         | 80001            |
| Mantle   | MNT    | 5000     | Mantle Sepolia | 5003             |

## 🔗 Adding New Chains

The bot architecture makes adding new blockchain networks simple:

### Step 1: Add Chain Configuration

```javascript
// Add to chain configs in wallet-utils.js
newchain: {
  nativeSymbol: "NEW",           // Native token symbol
  nativeDecimals: 18,            // Native token decimals
  chainId: 1234,                 // Mainnet chain ID
  testnetChainId: 5678,          // Testnet chain ID
  explorerUrl: "https://newscan.io/tx/",
  testnetExplorerUrl: "https://testnet.newscan.io/tx/",
  usdThreshold: 5,               // Minimum USD value to sweep
  pollInterval: 20000            // Check interval in ms
}
```

### Step 2: Add RPC Configuration

```bash
# Add to .env file
NEW_RPC=https://new-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}
NEW_TESTNET_RPC=https://new-testnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}
```

### Benefits of Our Architecture

- ✅ **Automatic native token handling** - Support for different decimal places
- ✅ **Smart explorer integration** - Auto-generates correct block explorer links
- ✅ **Unified command interface** - Same commands work across all chains
- ✅ **Testnet support** - Built-in testnet configurations for safe testing

### Testing New Chains

```bash
# Test your new chain configuration
npm run test:multiuser
```

## 📦 Dependencies

| Package                                                                 | Version | Purpose                          |
| ----------------------------------------------------------------------- | ------- | -------------------------------- |
| [ethers](https://docs.ethers.org/)                                      | ^6.15.0 | Ethereum blockchain interactions |
| [node-telegram-bot-api](https://github.com/yagop/node-telegram-bot-api) | ^0.61.0 | Telegram bot interface           |
| [node-fetch](https://github.com/node-fetch/node-fetch)                  | ^2.6.7  | HTTP requests for APIs           |
| [dotenv](https://github.com/motdotla/dotenv)                            | ^16.3.1 | Environment variable management  |
| [crypto](https://nodejs.org/api/crypto.html)                            | ^1.0.1  | Cryptographic operations         |

### Development Dependencies

| Package                        | Version | Purpose                  |
| ------------------------------ | ------- | ------------------------ |
| [nodemon](https://nodemon.io/) | ^3.0.1  | Development auto-restart |

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request. For major changes, please open an issue first to discuss what you would like to change.

### Development Setup

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

### Guidelines

- Follow existing code style and conventions
- Add tests for new features
- Update documentation as needed
- Test thoroughly with testnet mode before production

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## ⚠️ Disclaimer

This software is provided as-is for educational and automation purposes. Use at your own risk. The developers are not responsible for any financial losses. Always:

- 🧪 Test thoroughly with small amounts
- 🔒 Understand the security implications
- 📚 Review the code before use
- 💰 Never risk more than you can afford to lose

---

## 🎯 Project Stats

- 🚀 **Multi-chain ready** - Ethereum, Polygon, Mantle support
- 👥 **Multi-user capable** - Up to 3 concurrent users
- 🔐 **Security focused** - Encrypted storage, isolated user data
- 🧪 **Test friendly** - Comprehensive testnet mode
- 📈 **Production ready** - Used in live environments

**Made with ❤️ for the DeFi community**
