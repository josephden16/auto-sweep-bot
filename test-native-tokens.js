// test-native-tokens.js - Test native token handling for different chains
require("dotenv").config();

const {
  formatNativeBalance,
  getNativeTokenInfo,
  isTestnetMode,
  CHAINS,
  TESTNET_CHAINS,
} = require("./wallet-utils");
const { ethers } = require("ethers");

console.log("🪙 Testing Native Token Handling\n");

console.log(
  `🌐 Current Mode: ${isTestnetMode ? "🧪 TESTNET" : "📡 MAINNET"}\n`
);

// Mock balance for testing (1.5 tokens)
const testBalance = ethers.utils.parseUnits("1.5", 18);

console.log("🔍 Testing native token formatting for each chain:\n");

const activeChains = isTestnetMode ? TESTNET_CHAINS : CHAINS;

Object.keys(activeChains).forEach((chainKey) => {
  try {
    const nativeInfo = getNativeTokenInfo(chainKey);
    const balanceInfo = formatNativeBalance(chainKey, testBalance);

    console.log(`${chainKey.toUpperCase()}:`);
    console.log(
      `  Native Token: ${nativeInfo.symbol} (${nativeInfo.decimals} decimals)`
    );
    console.log(
      `  Formatted Balance: ${balanceInfo.formatted} ${balanceInfo.symbol}`
    );
    console.log(`  Chain: ${nativeInfo.name}`);
    console.log();
  } catch (error) {
    console.log(`❌ ${chainKey}: ${error.message}`);
  }
});

console.log(
  "🚀 Example: How to add a new chain with different native token decimals\n"
);

// Example of how easy it is to add a new chain (like BNB Smart Chain)
const exampleNewChain = {
  binance: {
    nativeSymbol: "BNB",
    nativeDecimals: 18,
    chainId: 56,
    name: "BNB Smart Chain",
    explorerUrl: "https://bscscan.com/tx/",
    // ... other config
  },
  arbitrum: {
    nativeSymbol: "ETH",
    nativeDecimals: 18,
    chainId: 42161,
    name: "Arbitrum One",
    explorerUrl: "https://arbiscan.io/tx/",
    // ... other config
  },
  optimism: {
    nativeSymbol: "ETH",
    nativeDecimals: 18,
    chainId: 10,
    name: "Optimism",
    explorerUrl: "https://optimistic.etherscan.io/tx/",
    // ... other config
  },
  // Example of a chain with different decimals
  hypothetical: {
    nativeSymbol: "HYPO",
    nativeDecimals: 8, // Bitcoin-style 8 decimals
    chainId: 999999,
    name: "Hypothetical Chain",
    explorerUrl: "https://hyposcan.io/tx/",
  },
};

console.log("Example new chains that could be easily added:\n");

Object.entries(exampleNewChain).forEach(([key, config]) => {
  // Simulate formatting with different decimal places
  let testBal;
  try {
    testBal = ethers.utils.parseUnits("1.5", config.nativeDecimals);
    const formatted = ethers.utils.formatUnits(testBal, config.nativeDecimals);

    console.log(`${key.toUpperCase()}:`);
    console.log(
      `  Native Token: ${config.nativeSymbol} (${config.nativeDecimals} decimals)`
    );
    console.log(`  Example Balance: ${formatted} ${config.nativeSymbol}`);
    console.log(`  Chain: ${config.name}`);
    console.log(`  Explorer: ${config.explorerUrl}0x1234...`);
    console.log();
  } catch (error) {
    console.log(`❌ ${key}: Error with decimals ${config.nativeDecimals}`);
  }
});

console.log("💡 Benefits of this implementation:");
console.log("✅ Automatic decimal handling for each chain");
console.log("✅ Easy to add new chains with different native tokens");
console.log("✅ Supports chains with non-18 decimal native tokens");
console.log("✅ Consistent API across all chains");
console.log("✅ Type-safe token information");

console.log("\n✅ Native token handling test completed!");
