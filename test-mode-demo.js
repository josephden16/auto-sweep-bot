// test-mode-demo.js - Demonstrate TEST_MODE functionality
require("dotenv").config();

const {
  getActiveChains,
  isTestnetMode,
  getChainConfigWithMode,
  CHAINS,
  TESTNET_CHAINS,
} = require("./wallet-utils");

console.log("🔧 Testing TEST_MODE functionality...\n");

// Show current mode
console.log(`🌐 Current Mode: ${isTestnetMode ? "🧪 TESTNET" : "📡 MAINNET"}`);
console.log(`Environment variable TESTNET_MODE: ${process.env.TESTNET_MODE}`);
console.log(`Environment variable TEST_MODE: ${process.env.TEST_MODE}\n`);

// Show active chains
console.log("📋 Active Chains:");
const activeChains = getActiveChains();
Object.entries(activeChains).forEach(([key, config]) => {
  console.log(`  ${key}: ${config.nativeSymbol} (Chain ID: ${config.chainId})`);
});

console.log("\n🔍 Testing chain config lookup:");
const testChains = ["ethereum", "polygon", "mantle"];

testChains.forEach((chainKey) => {
  const config = getChainConfigWithMode(chainKey);
  if (config) {
    const modeIndicator = config.testnet ? "🧪" : "📡";
    console.log(
      `✅ ${modeIndicator} ${chainKey}: ${config.nativeSymbol} (Chain ID: ${config.chainId})`
    );
  } else {
    console.log(`❌ ${chainKey}: Not found`);
  }
});

console.log("\n💡 To switch modes:");
console.log("  Mainnet: Remove TESTNET_MODE from .env");
console.log("  Testnet: Add TESTNET_MODE=true to .env");

console.log(
  "\n🎯 Available commands in Telegram bot (same commands work in both modes):"
);
console.log("  /enable ethereum");
console.log("  /enable polygon");
console.log("  /enable mantle");
console.log("  /discover ethereum");

console.log("\n✅ TEST_MODE implementation test completed!");
