import hardhatEthers from "@nomicfoundation/hardhat-ethers";
import { defineConfig } from "hardhat/config";
import "dotenv/config";

export default defineConfig({
  plugins: [hardhatEthers],

  solidity: {
  version: "0.8.20",
  settings: {
    optimizer: {
      enabled: true,
      runs: 200,
    },
    viaIR: true,
  },
},  

  networks: {
    ganache: {
      type: "http",
      url: "http://127.0.0.1:8545",
    },

    sepolia: {
      type: "http",
      url: process.env.RPC_URL!,
      accounts: [process.env.DEPLOYER_PRIVATE_KEY!],
    },
  },
});