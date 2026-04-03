import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@nomicfoundation/hardhat-verify";
import "dotenv/config";

const INFURA_API_KEY    = process.env.INFURA_API_KEY    ?? "";
const RAW_KEY           = process.env.PRIVATE_KEY       ?? "";
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY ?? "";

// Accept private keys both with and without a leading 0x.
// This prevents Hardhat from crashing when placeholders are present,
// while supporting common MetaMask export formats.
const SANITIZED_KEY = RAW_KEY.startsWith("0x") ? RAW_KEY.slice(2) : RAW_KEY;
const PRIVATE_KEY = /^[0-9a-fA-F]{64}$/.test(SANITIZED_KEY) ? SANITIZED_KEY : "";

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