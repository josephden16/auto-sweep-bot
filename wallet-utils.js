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
    nativeDecimals: 18,
    chainId: 1,
    explorerUrl: "https://etherscan.io/tx/",
  },
  polygon: {
    rpc: `https://polygon-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
    alchemy: `https://polygon-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
    nativeSymbol: "MATIC",
    nativeDecimals: 18,
    chainId: 137,
    explorerUrl: "https://polygonscan.com/tx/",
  },
  mantle: {
    rpc: `https://mantle-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
    alchemy: `https://mantle-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
    nativeSymbol: "MNT",
    nativeDecimals: 18,
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
    nativeDecimals: 18,
    chainId: 11155111,
    testnet: true,
    explorerUrl: "https://sepolia.etherscan.io/tx/",
  },
  polygon: {
    rpc: `https://polygon-amoy.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
    alchemy: `https://polygon-amoy.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
    nativeSymbol: "MATIC",
    nativeDecimals: 18,
    chainId: 80002,
    testnet: true,
    explorerUrl: "https://amoy.polygonscan.com/tx/",
  },
  mantle: {
    rpc: `https://mantle-sepolia.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
    alchemy: `https://mantle-sepolia.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
    nativeSymbol: "MNT",
    nativeDecimals: 18,
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
  const url = `${chainConfig.alchemy}`;
  const resp = await fetch(url, {
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "alchemy_getTokenBalances",
      params: [address],
      id: 1,
    }),
    method: "POST",
  });

  const data = await resp.json();

  if (!data?.result?.tokenBalances) return [];

  const balances = [];

  for (const t of data?.result?.tokenBalances) {
    if (t.tokenBalance === "0") continue; // skip zero balances

    // fetch metadata for decimals + symbol
    const metaUrl = `${chainConfig.alchemy}`;
    const metaResp = await fetch(metaUrl, {
      method: "POST",
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "alchemy_getTokenMetadata",
        params: [t.contractAddress],
        id: 1,
      }),
    });

    const meta = (await metaResp.json())?.result || {};

    balances.push({
      contract: t.contractAddress,
      balance: t.tokenBalance,
      symbol: meta.symbol,
      name: meta.name || meta.symbol || "Unknown",
      decimals: meta.decimals || 18,
    });
  }

  return balances;
}

/**
 * Estimate gas needed for ERC-20 token transfers
 */
async function estimateTokenGasCosts(wallet, destAddress, tokens) {
  let totalGasNeeded = ethers.BigNumber.from("0");

  for (const token of tokens) {
    try {
      const abi = [
        "function transfer(address to, uint256 value) returns (bool)",
      ];
      const contract = new ethers.Contract(token.contract, abi, wallet);

      // Estimate gas for this token transfer
      const gasEstimate = await contract.estimateGas.transfer(
        destAddress,
        token.balance
      );
      totalGasNeeded = totalGasNeeded.add(gasEstimate);
    } catch (error) {
      // If gas estimation fails, use a conservative estimate
      totalGasNeeded = totalGasNeeded.add(ethers.BigNumber.from("65000")); // Conservative ERC-20 transfer gas
    }
  }

  return totalGasNeeded;
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

  // Check if we have enough gas before attempting transfer
  const balance = await wallet.provider.getBalance(wallet.address);
  const feeData = await wallet.provider.getFeeData();
  const gasPrice = feeData.gasPrice || ethers.utils.parseUnits("30", "gwei");

  try {
    const gasEstimate = await contract.estimateGas.transfer(dest, rawBalance);
    const gasCost = gasEstimate.mul(gasPrice);

    if (balance.lt(gasCost)) {
      throw new Error(
        `Insufficient gas: need ${ethers.utils.formatEther(
          gasCost
        )} ETH, have ${ethers.utils.formatEther(balance)} ETH`
      );
    }

    const tx = await contract.transfer(dest, rawBalance, {
      gasLimit: gasEstimate.add(gasEstimate.div(10)), // Add 10% buffer
      gasPrice: gasPrice,
    });

    return tx.hash;
  } catch (error) {
    throw new Error(`Token transfer failed: ${error.message}`);
  }
}

/**
 * Sweep native token (ETH, MATIC, MNT) with smart gas management
 */
async function sweepNative(wallet, dest, chain, gasReserve = null) {
  const balance = await wallet.provider.getBalance(wallet.address);
  if (balance.eq(0)) return null;

  const feeData = await wallet.provider.getFeeData();
  const gasLimit = ethers.BigNumber.from("21000");
  const gasPrice = feeData.gasPrice || ethers.utils.parseUnits("30", "gwei");
  const nativeTransferCost = gasPrice.mul(gasLimit);

  // Total gas needed = native transfer cost + reserve for ERC-20 transfers
  const totalGasNeeded = gasReserve
    ? nativeTransferCost.add(gasReserve.mul(gasPrice))
    : nativeTransferCost;

  if (balance.lte(totalGasNeeded)) return null;

  const amount = balance.sub(totalGasNeeded);

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
 * Format native token balance with correct decimals for the chain
 */
function formatNativeBalance(chain, balance) {
  const chainConfig = getChainConfigWithMode(chain);
  if (!chainConfig) {
    throw new Error(`Unsupported chain: ${chain}`);
  }

  const decimals = chainConfig.nativeDecimals || 18;
  const symbol = chainConfig.nativeSymbol || "ETH";

  // Use ethers.utils.formatUnits for proper decimal handling
  const formatted = ethers.utils.formatUnits(balance, decimals);

  return {
    formatted,
    symbol,
    decimals,
    raw: balance,
  };
}

/**
 * Get native token info for a chain
 */
function getNativeTokenInfo(chain) {
  const chainConfig = getChainConfigWithMode(chain);
  if (!chainConfig) {
    throw new Error(`Unsupported chain: ${chain}`);
  }

  return {
    symbol: chainConfig.nativeSymbol || "ETH",
    decimals: chainConfig.nativeDecimals || 18,
    name: chainConfig.name || "Unknown Chain",
  };
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
  formatNativeBalance,
  getNativeTokenInfo,
  estimateTokenGasCosts,
};
