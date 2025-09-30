// testnet-example.js - Example of how to use testnet chains
require("dotenv").config();
const {
  CHAINS,
  TESTNET_CHAINS,
  getWalletFromMnemonic,
  getTokenBalances,
  getChainConfig,
  getAllChains,
  isTestnet,
} = require("./wallet-utils");

// Example: Show all available chains
console.log("🌐 Available Chains:");
console.log("\n📡 Mainnet Chains:");
Object.entries(CHAINS).forEach(([key, config]) => {
  console.log(`  ${key}: ${config.nativeSymbol} (Chain ID: ${config.chainId})`);
});

console.log("\n🧪 Testnet Chains:");
Object.entries(TESTNET_CHAINS).forEach(([key, config]) => {
  console.log(`  ${key}: ${config.nativeSymbol} (Chain ID: ${config.chainId})`);
});

// Example: Test wallet derivation on testnet
async function testTestnetWallet() {
  // Use a test mnemonic (never use real funds!)
  const testMnemonic =
    "test test test test test test test test test test test junk";

  console.log("\n🔑 Testing wallet derivation on testnets...");

  for (const chainKey of Object.keys(TESTNET_CHAINS)) {
    try {
      const wallet = getWalletFromMnemonic(testMnemonic, chainKey);
      console.log(`✅ ${chainKey}: ${wallet.address}`);

      // Check if it's testnet
      console.log(`   ${isTestnet(chainKey) ? "🧪 Testnet" : "📡 Mainnet"}`);

      // Get chain config
      const config = getChainConfig(chainKey);
      console.log(
        `   Chain ID: ${config.chainId}, Symbol: ${config.nativeSymbol}`
      );
    } catch (error) {
      console.log(`❌ ${chainKey}: ${error.message}`);
    }
  }
}

// Example: How to fetch testnet token balances
async function testTokenBalances() {
  console.log("\n💰 Testing token balance fetching on testnets...");

  // Example wallet address (replace with your test wallet)
  const testAddress = "0x8ba1f109551bD432803012645Hac136c";

  for (const chainKey of ["sepolia", "polygon-mumbai"]) {
    try {
      console.log(`\nFetching balances on ${chainKey}...`);
      const tokens = await getTokenBalances(chainKey, testAddress);

      if (tokens.length > 0) {
        tokens.forEach((token) => {
          console.log(
            `  ${token.symbol}: ${token.balance} (${token.contract})`
          );
        });
      } else {
        console.log(`  No tokens found on ${chainKey}`);
      }
    } catch (error) {
      console.log(`❌ Error fetching ${chainKey}: ${error.message}`);
    }
  }
}

// Run examples
if (require.main === module) {
  testTestnetWallet()
    .then(() => testTokenBalances())
    .catch(console.error);
}

module.exports = {
  testTestnetWallet,
  testTokenBalances,
};
