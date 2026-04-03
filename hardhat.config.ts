import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@nomicfoundation/hardhat-verify";
import "dotenv/config";

const INFURA_API_KEY    = process.env.INFURA_API_KEY    ?? "";
const RAW_KEY           = process.env.PRIVATE_KEY       ?? "";
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY ?? "";

// Only use the key if it looks like a real 32-byte hex string (64 hex chars).
// This prevents Hardhat from crashing with "private key too short" when the
// .env still contains the placeholder value from .env.example.
const PRIVATE_KEY = /^[0-9a-fA-F]{64}$/.test(RAW_KEY) ? RAW_KEY : "";

if (!INFURA_API_KEY)    console.warn("⚠️  INFURA_API_KEY not set");
if (!PRIVATE_KEY)       console.warn("⚠️  PRIVATE_KEY not set (needed for deployment, not for compile/test)");
if (!ETHERSCAN_API_KEY) console.warn("⚠️  ETHERSCAN_API_KEY not set");

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },

  networks: {
    hardhat: {
      chainId: 31337,
    },
    sepolia: {
      url: `https://sepolia.infura.io/v3/${INFURA_API_KEY}`,
      accounts: PRIVATE_KEY ? [`0x${PRIVATE_KEY}`] : [],
      chainId: 11155111,
      gas: "auto",
      gasPrice: "auto",
    },
  },

  etherscan: {
    apiKey: ETHERSCAN_API_KEY,
  },

  sourcify: {
    enabled: false,
  },

  paths: {
    sources:   "./contracts",
    tests:     "./test",
    cache:     "./cache",
    artifacts: "./artifacts",
  },

  typechain: {
    outDir: "typechain-types",
    target: "ethers-v6",
  },
};

export default config;