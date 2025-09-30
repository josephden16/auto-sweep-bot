// test-config.js - Simple script to validate your configuration
require("dotenv").config();
const { ethers } = require("ethers");
const {
  CHAINS,
  TESTNET_CHAINS,
  getWalletFromMnemonic,
  getAllChains,
} = require("./wallet-utils");

async function testConfiguration() {
  console.log("🔧 Testing Auto Sweep Bot Configuration...\n");

  // Test environment variables
  const requiredEnvVars = ["ALCHEMY_API_KEY", "BOT_TOKEN", "CHAT_ID"];
  const missingVars = requiredEnvVars.filter(
    (varName) => !process.env[varName]
  );

  if (missingVars.length > 0) {
    console.error("❌ Missing environment variables:", missingVars.join(", "));
    return;
  }
  console.log("✅ All required environment variables are set");

  // Test destination address
  if (
    process.env.DEST_ADDRESS &&
    ethers.utils.isAddress(process.env.DEST_ADDRESS)
  ) {
    console.log("✅ Destination address is valid:", process.env.DEST_ADDRESS);
  } else {
    console.log("⚠️  No valid destination address set in DEST_ADDRESS");
  }

  // Test Alchemy connectivity
  console.log("\n🌐 Testing Alchemy connectivity...");

  console.log("📡 Mainnet Chains:");
  for (const [chainKey, chainConfig] of Object.entries(CHAINS)) {
    try {
      const provider = new ethers.providers.JsonRpcProvider(chainConfig.rpc);
      const blockNumber = await provider.getBlockNumber();
      console.log(
        `✅ ${chainConfig.nativeSymbol} (${chainKey}): Connected, latest block ${blockNumber}`
      );
    } catch (error) {
      console.log(
        `❌ ${chainConfig.nativeSymbol} (${chainKey}): Connection failed - ${error.message}`
      );
    }
  }

  console.log("\n🧪 Testnet Chains:");
  for (const [chainKey, chainConfig] of Object.entries(TESTNET_CHAINS)) {
    try {
      const provider = new ethers.providers.JsonRpcProvider(chainConfig.rpc);
      const blockNumber = await provider.getBlockNumber();
      console.log(
        `✅ ${chainConfig.nativeSymbol} (${chainKey}): Connected, latest block ${blockNumber}`
      );
    } catch (error) {
      console.log(
        `❌ ${chainConfig.nativeSymbol} (${chainKey}): Connection failed - ${error.message}`
      );
    }
  }

  // Test with a sample mnemonic (if provided)
  if (process.argv[2]) {
    const testMnemonic = process.argv[2];
    console.log("\n🔑 Testing wallet derivation...");

    if (ethers.utils.isValidMnemonic(testMnemonic)) {
      console.log("✅ Mnemonic is valid");

      try {
        const wallet = getWalletFromMnemonic(testMnemonic, "ethereum");
        console.log("✅ Wallet derived successfully:", wallet.address);
      } catch (error) {
        console.log("❌ Wallet derivation failed:", error.message);
      }
    } else {
      console.log("❌ Invalid mnemonic phrase");
    }
  } else {
    console.log(
      '\n💡 To test wallet derivation, run: node test-config.js "your mnemonic phrase here"'
    );
  }

  console.log("\n🎉 Configuration test completed!");
}

testConfiguration().catch(console.error);
