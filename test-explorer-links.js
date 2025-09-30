// test-explorer-links.js - Test explorer link generation
require("dotenv").config();

const { getExplorerLink, isTestnetMode } = require("./wallet-utils");

console.log("🔗 Testing Explorer Link Generation\n");

console.log(
  `🌐 Current Mode: ${isTestnetMode ? "🧪 TESTNET" : "📡 MAINNET"}\n`
);

// Test transaction hash (example)
const testTxHash =
  "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef12";

const chains = ["ethereum", "polygon", "mantle"];

console.log("🔍 Testing explorer links for each chain:\n");

chains.forEach((chain) => {
  const explorerLink = getExplorerLink(chain, testTxHash);
  console.log(`${chain.toUpperCase()}:`);
  console.log(`  ${explorerLink}`);
  console.log();
});

console.log("💡 Example notifications with explorer links:");
console.log(`
💰 Swept 1.5 ETH (~$3,750.00) on Ethereum
🔗 ${getExplorerLink("ethereum", testTxHash)}

💰 Swept 1000.0 USDC (~$1,000.00) on Polygon  
🔗 ${getExplorerLink("polygon", testTxHash)}

💰 Swept native Mantle token
🔗 ${getExplorerLink("mantle", testTxHash)}
`);

console.log("✅ Explorer link test completed!");
