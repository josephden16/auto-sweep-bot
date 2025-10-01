# Adding New Chains to Auto Sweep Bot

This guide explains how to easily add support for new blockchain networks to the auto sweep bot.

## Overview

The bot is designed to be highly extensible. Adding a new chain requires updating configuration in just a few places, and the bot automatically handles:

- ✅ Native token formatting with correct decimals
- ✅ Blockchain explorer links
- ✅ RPC connections
- ✅ Token discovery via Alchemy (if supported)

## Step 1: Add Chain Configuration

### Mainnet Configuration

Edit `wallet-utils.js` and add your chain to the `CHAINS` object:

```javascript
const CHAINS = {
  // ... existing chains
  "your-chain": {
    rpc: `https://your-chain-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
    alchemy: `https://your-chain-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
    nativeSymbol: "YCT", // Your chain's native token symbol
    nativeDecimals: 18, // Native token decimals (usually 18)
    chainId: 12345, // Your chain's ID
    explorerUrl: "https://yourscan.io/tx/", // Block explorer URL
  },
};
```

### Testnet Configuration

Add the testnet equivalent to `TESTNET_CHAINS`:

```javascript
const TESTNET_CHAINS = {
  // ... existing chains
  "your-chain": {
    rpc: `https://your-chain-testnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
    alchemy: `https://your-chain-testnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
    nativeSymbol: "YCT",
    nativeDecimals: 18,
    chainId: 54321, // Testnet chain ID
    testnet: true,
    explorerUrl: "https://testnet.yourscan.io/tx/",
  },
};
```

## Step 2: Add Telegram Bot Configuration

Edit `telegram-sweeper.js` and add your chain to both mainnet and testnet configurations:

```javascript
function getChainConfigs() {
  if (isTestnetMode) {
    return {
      // ... existing testnet chains
      "your-chain": {
        name: "Your Chain Testnet",
        chainId: 54321,
        rpcUrl: process.env.YOUR_CHAIN_RPC,
        usdThreshold: 1, // Lower threshold for testnet
        pollInterval: 30000, // 30 second polling
        testnet: true,
      },
    };
  }

  return {
    // ... existing mainnet chains
    "your-chain": {
      name: "Your Chain",
      chainId: 12345,
      rpcUrl: process.env.YOUR_CHAIN_RPC,
      usdThreshold: 5, // $5 minimum for mainnet
      pollInterval: 20000, // 20 second polling
      testnet: false,
    },
  };
}
```

## Step 3: Add Environment Variables

Add to your `.env` file:

```bash
# Your Chain RPC (optional - defaults to Alchemy)
YOUR_CHAIN_RPC=https://your-chain-mainnet.g.alchemy.com/v2/your_api_key
```

## Step 4: Test Your Implementation

Run the native token test to verify everything works:

```bash
npm run test-native
```

This will show you how your chain's native tokens are formatted.

## Real Examples

### Adding Arbitrum One

```javascript
// In CHAINS object
arbitrum: {
  rpc: `https://arb-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
  alchemy: `https://arb-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
  nativeSymbol: "ETH",      // Arbitrum uses ETH as native token
  nativeDecimals: 18,
  chainId: 42161,
  explorerUrl: "https://arbiscan.io/tx/",
},

// In TESTNET_CHAINS object
arbitrum: {
  rpc: `https://arb-sepolia.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
  alchemy: `https://arb-sepolia.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
  nativeSymbol: "ETH",
  nativeDecimals: 18,
  chainId: 421614,
  testnet: true,
  explorerUrl: "https://sepolia.arbiscan.io/tx/",
},
```

### Adding BNB Smart Chain

```javascript
// In CHAINS object
binance: {
  rpc: "https://bsc-dataseed1.binance.org/",  // Public RPC
  alchemy: "https://bsc-dataseed1.binance.org/", // Fallback to public RPC
  nativeSymbol: "BNB",
  nativeDecimals: 18,
  chainId: 56,
  explorerUrl: "https://bscscan.com/tx/",
},
```

### Adding a Chain with Different Decimals

```javascript
// Example: If a chain uses 8 decimals like Bitcoin
bitcoin: {
  rpc: "https://bitcoin-rpc-endpoint.com/",
  alchemy: "https://bitcoin-rpc-endpoint.com/",
  nativeSymbol: "BTC",
  nativeDecimals: 8,        // Bitcoin uses 8 decimals!
  chainId: 999,
  explorerUrl: "https://blockchair.com/bitcoin/transaction/",
},
```

## Bot Commands

Once added, users can immediately use your new chain:

```bash
/enable your-chain      # Start sweeping on your chain
/discover your-chain    # Check balances on your chain
/status                 # Will show your chain in the status
```

## Features That Work Automatically

Once you add a chain, these features work immediately:

- ✅ **Native token sweeping** with correct decimal formatting
- ✅ **ERC-20 token discovery** (if Alchemy supports the chain)
- ✅ **Blockchain explorer links** in notifications
- ✅ **USD threshold filtering**
- ✅ **Testnet/mainnet mode switching**
- ✅ **Telegram notifications** with proper formatting
- ✅ **Error handling and logging**

## Notes

1. **Alchemy Support**: Your chain must be supported by Alchemy for automatic ERC-20 token discovery
2. **RPC Endpoints**: You can use public RPC endpoints if Alchemy doesn't support your chain
3. **Gas Calculations**: The current gas logic works for most EVM chains but may need adjustment for chains with different gas mechanics
4. **Native Decimals**: Most chains use 18 decimals, but some (like Bitcoin-based chains) use different amounts

## Testing

Always test new chains on testnet first:

1. Set `TESTNET_MODE=true` in your `.env`
2. Add testnet configuration
3. Test with small amounts
4. Verify explorer links work
5. Check native token formatting

That's it! The bot is designed to make adding new chains as simple as possible while maintaining all functionality.
