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
 * Derive wallet from mnemonic using ethers v6
 */
function getWalletFromMnemonic(mnemonic, chain) {
  const chainConfig = getChainConfigWithMode(chain);
  if (!chainConfig) {
    throw new Error(`Unsupported chain: ${chain}`);
  }
  const provider = new ethers.JsonRpcProvider(chainConfig.rpc);
  const wallet = ethers.Wallet.fromPhrase(mnemonic, provider);
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
 * Estimate gas needed for ERC-20 token transfers using ethers v6
 */
async function estimateTokenGasCosts(wallet, destAddress, tokens) {
  let totalGasNeeded = 0n;

  for (const token of tokens) {
    try {
      const abi = [
        "function transfer(address to, uint256 value) returns (bool)",
      ];
      const contract = new ethers.Contract(token.contract, abi, wallet);

      // Estimate gas for this token transfer
      const gasEstimate = await contract.transfer.estimateGas(
        destAddress,
        token.balance
      );
      // Add 20% buffer to each estimate
      const bufferedGas = gasEstimate + (gasEstimate * 20n) / 100n;
      totalGasNeeded = totalGasNeeded + bufferedGas;
    } catch (error) {
      // If gas estimation fails, use a conservative estimate with buffer
      totalGasNeeded = totalGasNeeded + 78000n; // Conservative ERC-20 transfer gas (65k + 20% buffer)
    }
  }

  return totalGasNeeded;
}

/**
 * Wait for transaction confirmation with timeout
 */
async function waitForTransactionWithTimeout(tx, timeoutMs = 1000 * 60 * 1) {
  return new Promise(async (resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(
        new Error(
          `Transaction confirmation timeout after ${timeoutMs / 1000}s: ${
            tx.hash
          }`
        )
      );
    }, timeoutMs);

    try {
      const receipt = await tx.wait(1);
      clearTimeout(timeout);
      resolve(receipt);
    } catch (error) {
      clearTimeout(timeout);
      reject(error);
    }
  });
}

/**
 * Get optimal gas pricing for the network with aggressive pricing for faster confirmation
 */
async function getOptimalGasPricing(provider) {
  try {
    const feeData = await provider.getFeeData();

    // For networks that support EIP-1559 (like Ethereum mainnet/testnet)
    if (feeData.maxFeePerGas && feeData.maxPriorityFeePerGas) {
      // Use more balanced aggressive pricing for faster confirmation
      // Increase both fees by 50% to maintain proper proportions
      const aggressiveMaxFee =
        feeData.maxFeePerGas + (feeData.maxFeePerGas * 50n) / 100n; // +50%
      const aggressivePriorityFee =
        feeData.maxPriorityFeePerGas +
        (feeData.maxPriorityFeePerGas * 50n) / 100n; // +50% instead of +100%

      // Ensure priority fee doesn't exceed max fee (EIP-1559 requirement)
      const finalPriorityFee =
        aggressivePriorityFee > aggressiveMaxFee
          ? aggressiveMaxFee
          : aggressivePriorityFee;

      // Log gas fee calculation for debugging
      if (aggressivePriorityFee > aggressiveMaxFee) {
        console.log(
          `⚠️ Priority fee adjusted: ${ethers.formatUnits(
            aggressivePriorityFee,
            "gwei"
          )} gwei → ${ethers.formatUnits(finalPriorityFee, "gwei")} gwei`
        );
      }

      return {
        type: 2, // EIP-1559
        maxFeePerGas: aggressiveMaxFee,
        maxPriorityFeePerGas: finalPriorityFee,
        gasPrice: null,
      };
    }
    // For legacy networks (like Polygon, Mantle)
    else {
      // Use much more aggressive gas price - minimum 100 gwei or network suggested + 50%
      const networkGasPrice =
        feeData.gasPrice || ethers.parseUnits("100", "gwei");
      const aggressiveGasPrice =
        networkGasPrice + (networkGasPrice * 50n) / 100n; // Add 50% buffer

      return {
        type: 0, // Legacy
        gasPrice: aggressiveGasPrice,
        maxFeePerGas: null,
        maxPriorityFeePerGas: null,
      };
    }
  } catch (error) {
    // Fallback to very aggressive pricing
    return {
      type: 0,
      gasPrice: ethers.parseUnits("150", "gwei"), // Very high fallback for fast confirmation
      maxFeePerGas: null,
      maxPriorityFeePerGas: null,
    };
  }
}

/**
 * Sweep a single ERC20 token using ethers v6 with improved gas management
 */
async function sweepToken(wallet, dest, token) {
  const abi = [
    "function transfer(address to, uint256 value) returns (bool)",
    "function balanceOf(address account) view returns (uint256)",
  ];
  const contract = new ethers.Contract(token.contract, abi, wallet);

  const rawBalance = await contract.balanceOf(wallet.address);
  if (rawBalance === 0n) return null;

  // Check if we have enough gas before attempting transfer
  const balance = await wallet.provider.getBalance(wallet.address);
  const gasPricing = await getOptimalGasPricing(wallet.provider);

  try {
    const gasEstimate = await contract.transfer.estimateGas(dest, rawBalance);
    const gasLimit = gasEstimate + (gasEstimate * 20n) / 100n; // Add 20% buffer for safety

    // Calculate gas cost based on pricing type
    let gasCost;
    if (gasPricing.type === 2) {
      // EIP-1559 transaction
      gasCost = gasLimit * gasPricing.maxFeePerGas;
    } else {
      // Legacy transaction
      gasCost = gasLimit * gasPricing.gasPrice;
    }

    if (balance < gasCost) {
      throw new Error(
        `Insufficient gas: need ${ethers.formatEther(
          gasCost
        )} ETH, have ${ethers.formatEther(balance)} ETH`
      );
    }

    // Construct transaction with appropriate gas pricing
    const txParams = {
      gasLimit: gasLimit,
    };

    if (gasPricing.type === 2) {
      // EIP-1559 transaction
      txParams.maxFeePerGas = gasPricing.maxFeePerGas;
      txParams.maxPriorityFeePerGas = gasPricing.maxPriorityFeePerGas;
      txParams.type = 2;
    } else {
      // Legacy transaction
      txParams.gasPrice = gasPricing.gasPrice;
      txParams.type = 0;
    }

    console.log(`🔧 Token transfer gas config:`, {
      gasLimit: gasLimit.toString(),
      gasCost: ethers.formatEther(gasCost),
      type: gasPricing.type === 2 ? "EIP-1559" : "Legacy",
      ...(gasPricing.type === 2
        ? {
            maxFeePerGas:
              ethers.formatUnits(gasPricing.maxFeePerGas, "gwei") + " gwei",
            maxPriorityFeePerGas:
              ethers.formatUnits(gasPricing.maxPriorityFeePerGas, "gwei") +
              " gwei",
          }
        : {
            gasPrice: ethers.formatUnits(gasPricing.gasPrice, "gwei") + " gwei",
          }),
    });

    const tx = await contract.transfer(dest, rawBalance, txParams);

    // Wait for transaction confirmation with timeout
    console.log(`⏳ Waiting for token transfer confirmation: ${tx.hash}`);
    console.log(`⏰ Timeout set for 1 minute...`);

    try {
      const receipt = await waitForTransactionWithTimeout(tx, 1000 * 60 * 1); // 1 minute timeout

      if (receipt.status === 1) {
        console.log(`✅ Token transfer confirmed: ${tx.hash}`);
        return tx.hash;
      } else {
        throw new Error(`Transaction failed: ${tx.hash}`);
      }
    } catch (timeoutError) {
      // If timeout occurs, return the hash anyway (transaction might confirm later)
      console.log(`⚠️ Transaction timeout (may still confirm): ${tx.hash}`);
      console.log(`🔗 Check manually: ${timeoutError.message}`);
      return tx.hash; // Return hash so user can track manually
    }
  } catch (error) {
    throw new Error(`Token transfer failed: ${error.message}`);
  }
}

/**
 * Sweep native token (ETH, MATIC, MNT) with smart gas management using ethers v6
 */
async function sweepNative(wallet, dest, chain, gasReserve = null) {
  const balance = await wallet.provider.getBalance(wallet.address);
  if (balance === 0n) return null;

  const gasPricing = await getOptimalGasPricing(wallet.provider);
  const gasLimit = 21000n;

  // Calculate native transfer cost
  let nativeTransferCost;
  if (gasPricing.type === 2) {
    nativeTransferCost = gasLimit * gasPricing.maxFeePerGas;
  } else {
    nativeTransferCost = gasLimit * gasPricing.gasPrice;
  }

  // Total gas needed = native transfer cost + reserve for ERC-20 transfers
  const gasReserveCost = gasReserve
    ? gasReserve * (gasPricing.gasPrice || gasPricing.maxFeePerGas)
    : 0n;
  const totalGasNeeded = nativeTransferCost + gasReserveCost;

  if (balance <= totalGasNeeded) return null;

  const amount = balance - totalGasNeeded;

  // Construct transaction with appropriate gas pricing
  const txParams = {
    to: dest,
    value: amount,
    gasLimit: gasLimit,
  };

  if (gasPricing.type === 2) {
    // EIP-1559 transaction
    txParams.maxFeePerGas = gasPricing.maxFeePerGas;
    txParams.maxPriorityFeePerGas = gasPricing.maxPriorityFeePerGas;
    txParams.type = 2;
  } else {
    // Legacy transaction
    txParams.gasPrice = gasPricing.gasPrice;
    txParams.type = 0;
  }

  console.log(`🔧 Native transfer gas config:`, {
    amount: ethers.formatEther(amount),
    gasLimit: gasLimit.toString(),
    gasCost: ethers.formatEther(nativeTransferCost),
    reserved: ethers.formatEther(gasReserveCost),
    type: gasPricing.type === 2 ? "EIP-1559" : "Legacy",
    ...(gasPricing.type === 2
      ? {
          maxFeePerGas:
            ethers.formatUnits(gasPricing.maxFeePerGas, "gwei") + " gwei",
          maxPriorityFeePerGas:
            ethers.formatUnits(gasPricing.maxPriorityFeePerGas, "gwei") +
            " gwei",
        }
      : {
          gasPrice: ethers.formatUnits(gasPricing.gasPrice, "gwei") + " gwei",
        }),
  });

  try {
    const tx = await wallet.sendTransaction(txParams);

    // Wait for transaction confirmation with timeout
    console.log(`⏳ Waiting for native transfer confirmation: ${tx.hash}`);
    console.log(`⏰ Timeout set for 5 minutes...`);

    try {
      const receipt = await waitForTransactionWithTimeout(tx, 1000 * 60 * 1); // 1 minute timeout

      if (receipt.status === 1) {
        console.log(`✅ Native transfer confirmed: ${tx.hash}`);
        return tx.hash;
      } else {
        throw new Error(`Transaction failed: ${tx.hash}`);
      }
    } catch (timeoutError) {
      // If timeout occurs, return the hash anyway (transaction might confirm later)
      console.log(`⚠️ Transaction timeout (may still confirm): ${tx.hash}`);
      console.log(`🔗 Check manually: ${timeoutError.message}`);
      return tx.hash; // Return hash so user can track manually
    }
  } catch (error) {
    throw new Error(`Native transfer failed: ${error.message}`);
  }
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

  // Use ethers.formatUnits for proper decimal handling
  const formatted = ethers.formatUnits(balance, decimals);

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
  getOptimalGasPricing,
  waitForTransactionWithTimeout,
};
