require("@nomicfoundation/hardhat-toolbox");

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.24",
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
    rootstock: {
      url: process.env.RSK_RPC_URL || "https://public-node.rsk.co",
      chainId: 30,
    },
    rootstock_testnet: {
      url: process.env.RSK_TESTNET_RPC_URL || "https://public-node.testnet.rsk.co",
      chainId: 31,
    },
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
};
