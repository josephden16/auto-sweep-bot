// wallet-utils.js
require("dotenv").config();
const { ethers } = require("ethers");
const fetch = require("node-fetch");

const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY;

// Map supported chains to Alchemy endpoints + native gas token symbol
const CHAINS = {
  ethereum: {
    rpc: `https://eth-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
    alchemy: `https://eth-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
    nativeSymbol: "ETH",
    chainId: 1,
    explorerUrl: "https://etherscan.io/tx/",
  },
  polygon: {
    rpc: `https://polygon-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
    alchemy: `https://polygon-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
    nativeSymbol: "MATIC",
    chainId: 137,
    explorerUrl: "https://polygonscan.com/tx/",
  },
  mantle: {
    rpc: `https://mantle-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
    alchemy: `https://mantle-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
    nativeSymbol: "MNT",
    chainId: 5000,
    explorerUrl: "https://explorer.mantle.xyz/tx/",
  },
};

// Testnet equivalents for testing purposes
const TESTNET_CHAINS = {
  ethereum: {
    rpc: `https://eth-sepolia.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
    alchemy: `https://eth-sepolia.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
    nativeSymbol: "ETH",
    chainId: 11155111,
    testnet: true,
    explorerUrl: "https://sepolia.etherscan.io/tx/",
  },
  polygon: {
    rpc: `https://polygon-amoy.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
    alchemy: `https://polygon-amoy.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
    nativeSymbol: "MATIC",
    chainId: 80002,
    testnet: true,
    explorerUrl: "https://amoy.polygonscan.com/tx/",
  },
  mantle: {
    rpc: `https://mantle-sepolia.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
    alchemy: `https://mantle-sepolia.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
    nativeSymbol: "MNT",
    chainId: 5003,
    testnet: true,
    explorerUrl: "https://explorer.sepolia.mantle.xyz/tx/",
  },
};

// Check if testnet mode is enabled
const isTestnetMode =
  process.env.TESTNET_MODE === "true" || process.env.TEST_MODE === "true";

/**
 * Get active chains based on TEST_MODE environment variable
 */
function getActiveChains() {
  if (isTestnetMode) {
    return TESTNET_CHAINS;
  }
  return CHAINS;
}

/**
 * Get chain configuration with testnet mode support
 */
function getChainConfigWithMode(chain) {
  if (isTestnetMode) {
    return TESTNET_CHAINS[chain];
  }
  return CHAINS[chain];
}

/**
 * Derive wallet from mnemonic
 */
function getWalletFromMnemonic(mnemonic, chain) {
  const chainConfig = getChainConfigWithMode(chain);
  if (!chainConfig) {
    throw new Error(`Unsupported chain: ${chain}`);
  }
  const provider = new ethers.providers.JsonRpcProvider(chainConfig.rpc);
  const wallet = ethers.Wallet.fromMnemonic(mnemonic).connect(provider);
  return wallet;
}

/**
 * Fetch ERC20 + native token balances via Alchemy
 */
async function getTokenBalances(chain, address) {
  const chainConfig = getChainConfigWithMode(chain);
  if (!chainConfig) {
    throw new Error(`Unsupported chain: ${chain}`);
  }
  const url = `${chainConfig.alchemy}/getTokenBalances/?address=${address}`;
  const resp = await fetch(url);
  const data = await resp.json();

  if (!data.tokenBalances) return [];

  const balances = [];

  for (const t of data.tokenBalances) {
    if (t.tokenBalance === "0") continue; // skip zero balances

    // fetch metadata for decimals + symbol
    const metaUrl = `${chainConfig.alchemy}/getTokenMetadata?contractAddress=${t.contractAddress}`;
    const metaResp = await fetch(metaUrl);
    const meta = await metaResp.json();

    balances.push({
      contract: t.contractAddress,
      balance: t.tokenBalance,
      symbol: meta.symbol,
      decimals: meta.decimals || 18,
    });
  }

  return balances;
}

/**
 * Sweep a single ERC20 token
 */
async function sweepToken(wallet, dest, token) {
  const abi = [
    "function transfer(address to, uint256 value) returns (bool)",
    "function balanceOf(address account) view returns (uint256)",
  ];
  const contract = new ethers.Contract(token.contract, abi, wallet);

  const rawBalance = await contract.balanceOf(wallet.address);
  if (rawBalance.eq(0)) return null;

  const tx = await contract.transfer(dest, rawBalance);
  return tx.hash;
}

/**
 * Sweep native token (ETH, MATIC, MNT)
 */
async function sweepNative(wallet, dest, chain) {
  const balance = await wallet.provider.getBalance(wallet.address);
  if (balance.eq(0)) return null;

  const feeData = await wallet.provider.getFeeData();
  const gasLimit = ethers.BigNumber.from("21000");
  const gasPrice = feeData.gasPrice || ethers.utils.parseUnits("30", "gwei");
  const maxFee = gasPrice.mul(gasLimit);

  if (balance.lte(maxFee)) return null;

  const amount = balance.sub(maxFee);

  const tx = await wallet.sendTransaction({
    to: dest,
    value: amount,
    gasLimit,
    gasPrice: gasPrice,
  });

  return tx.hash;
}

/**
 * Get chain configuration (checks both mainnet and testnet)
 */
function getChainConfig(chain) {
  return CHAINS[chain] || TESTNET_CHAINS[chain];
}

/**
 * Get all available chains (mainnet + testnet)
 */
function getAllChains() {
  return {
    mainnet: CHAINS,
    testnet: TESTNET_CHAINS,
  };
}

/**
 * Check if chain is testnet
 */
function isTestnet(chain) {
  return !!TESTNET_CHAINS[chain];
}

/**
 * Generate blockchain explorer link for a transaction
 */
function getExplorerLink(chain, txHash) {
  const chainConfig = getChainConfigWithMode(chain);
  if (!chainConfig || !chainConfig.explorerUrl) {
    return `Transaction: ${txHash}`;
  }
  return `${chainConfig.explorerUrl}${txHash}`;
}

module.exports = {
  CHAINS,
  TESTNET_CHAINS,
  getWalletFromMnemonic,
  getTokenBalances,
  sweepToken,
  sweepNative,
  getChainConfig,
  getAllChains,
  isTestnet,
  getActiveChains,
  getChainConfigWithMode,
  isTestnetMode,
  getExplorerLink,
};
