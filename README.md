# Auto Sweep Bot

A Telegram bot that automatically sweeps native tokens and ERC-20 tokens from a specified wallet across multiple chains (Ethereum, Polygon, Mantle) when they exceed a USD threshold.

## Features

- ✅ Multi-chain support (Ethereum, Polygon, Mantle)
- ✅ Automatic native token sweeping
- ✅ ERC-20 token discovery and sweeping
- ✅ USD value threshold filtering
- ✅ Telegram bot interface for control
- ✅ Real-time notifications with blockchain explorer links
- ✅ Testnet mode for safe testing
- ✅ Consistent chain naming across modes
- ✅ Comprehensive logging

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Environment Configuration

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

Required environment variables:

- `ALCHEMY_API_KEY`: Your Alchemy API key for RPC access
- `BOT_TOKEN`: Your Telegram bot token from @BotFather
- `CHAT_ID`: Your Telegram chat ID for notifications
- `DEST_ADDRESS`: Destination wallet address for swept tokens

Optional environment variables:

- `TESTNET_MODE`: Set to `true` to use testnet chains instead of mainnet

### 2.1. Test Mode Configuration

The bot supports both mainnet and testnet modes:

**Mainnet Mode (default):**

- Uses real networks: Ethereum, Polygon, Mantle
- Higher USD thresholds ($5+)
- ⚠️ **Real money - be careful!**

**Testnet Mode:**

- Uses test networks: Sepolia, Polygon Mumbai, Mantle Sepolia
- Lower USD thresholds ($1+)
- Safe for testing with test tokens

To enable testnet mode, add to your `.env` file:

```bash
TESTNET_MODE=true
```

Test your configuration:

```bash
npm run test-mode
```

### 3. Create Telegram Bot

1. Message @BotFather on Telegram
2. Create a new bot with `/newbot`
3. Save the bot token to your `.env` file
4. Get your chat ID by messaging @userinfobot

### 4. Get Alchemy API Key

1. Sign up at [Alchemy](https://www.alchemy.com/)
2. Create a new app
3. Copy the API key to your `.env` file

## Usage

### Start the Bot

```bash
npm start
```

### Telegram Commands

- `/help` - Show available commands and current mode
- `/setwallet <mnemonic>` - Set the wallet to monitor (12/24 word phrase)
- `/settarget <address>` - Set destination address for swept tokens
- `/enable <chain>` - Start sweeping on a chain
- `/disable` - Stop all sweepers
- `/status` - Check sweeper status and current mode
- `/discover <chain>` - Check current balances on a chain

**Available chains (same names work in both modes):**

`ethereum`, `polygon`, `mantle`

**Note:** The same chain names work in both mainnet and testnet modes. The bot automatically connects to the appropriate network (mainnet or testnet) based on your `TESTNET_MODE` setting.

### Example Workflows

**Mainnet Example:**

```
/help
/setwallet abandon abandon abandon... (your 12-word mnemonic)
/settarget 0x1234567890123456789012345678901234567890
/enable ethereum
/enable polygon
/status
```

**Testnet Example:**

```
/help
/setwallet abandon abandon abandon... (your 12-word mnemonic)
/settarget 0x1234567890123456789012345678901234567890
/enable ethereum
/enable polygon
/discover ethereum

### Example Workflows

**Mainnet Example:**

```

/help
/setwallet abandon abandon abandon... (your 12-word mnemonic)
/settarget 0x1234567890123456789012345678901234567890
/enable ethereum
/enable polygon
/status

```

**Testnet Example:**

```

/help
/setwallet abandon abandon abandon... (your 12-word mnemonic)
/settarget 0x1234567890123456789012345678901234567890
/enable sepolia
/enable polygon-mumbai
/discover sepolia
/enable polygon
/status

````

## Notifications

The bot sends real-time Telegram notifications for successful sweeps with direct links to blockchain explorers:

**Example Mainnet Notifications:**
```
💰 Swept 1.5 ETH (~$3,750.00) on Ethereum
🔗 https://etherscan.io/tx/0x1234...5678

💰 Swept 1000.0 USDC (~$1,000.00) on Polygon
🔗 https://polygonscan.com/tx/0xabcd...efgh
```

**Example Testnet Notifications:**
```
💰 Swept 0.1 ETH (~$250.00) on Ethereum Sepolia
🔗 https://sepolia.etherscan.io/tx/0x9876...5432

💰 Swept native Mantle Sepolia token
🔗 https://explorer.sepolia.mantle.xyz/tx/0xfeed...beef
```

**Supported Explorers:**
- **Ethereum:** Etherscan / Sepolia Etherscan
- **Polygon:** Polygonscan / Amoy Polygonscan
- **Mantle:** Mantle Explorer / Mantle Sepolia Explorer

## Configuration

Each chain has configurable parameters in `telegram-sweeper.js`:

```javascript
const chains = {
  ethereum: {
    name: "Ethereum",
    chainId: 1,
    usdThreshold: 5, // Only sweep tokens worth $5+ USD
    pollInterval: 20000, // Check every 20 seconds
  },
  // ...
};
````

## Security Considerations

⚠️ **Important Security Notes:**

1. **Never share your mnemonic phrase** - Store it securely
2. **Use a dedicated wallet** for sweeping, not your main wallet
3. **Test with small amounts** first
4. **Keep your bot token secure** - Anyone with access can control the bot
5. **Use environment variables** - Never commit secrets to version control

## How It Works

1. **Monitoring**: The bot continuously monitors specified wallet addresses
2. **Discovery**: Uses Alchemy API to discover ERC-20 token balances
3. **Threshold Check**: Only sweeps tokens worth more than the USD threshold
4. **Gas Optimization**: Calculates gas costs and ensures profitable sweeps
5. **Execution**: Transfers tokens to the destination address
6. **Notification**: Sends Telegram notifications for successful sweeps

## Troubleshooting

### Common Issues

1. **"Invalid mnemonic" error**: Ensure your mnemonic phrase is correct and properly formatted
2. **"Invalid address" error**: Check that destination address is a valid Ethereum address
3. **Gas estimation failures**: May occur during network congestion, bot will retry
4. **Token balance fetch errors**: Usually temporary Alchemy API issues

### Logs

Check the logs in `logs/sweeper.log` for detailed error information.

## Supported Chains

- **Ethereum** (ETH) - Chain ID: 1
- **Polygon** (MATIC) - Chain ID: 137
- **Mantle** (MNT) - Chain ID: 5000

## Dependencies

- `ethers@^5.7.2` - Ethereum interactions
- `node-telegram-bot-api@^0.61.0` - Telegram bot interface
- `node-fetch@^2.6.7` - HTTP requests
- `dotenv@^16.3.1` - Environment variable management

## License

MIT License - see LICENSE file for details.

## Disclaimer

This software is provided as-is. Use at your own risk. Always test with small amounts first and understand the risks involved in automated cryptocurrency operations.
