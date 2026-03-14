const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with account:", deployer.address);

  const MockERC20 = await hre.ethers.getContractFactory("MockERC20");
  const asset = await MockERC20.deploy("Mock USDT", "USDT", 6);
  await asset.waitForDeployment();
  const assetAddr = await asset.getAddress();
  console.log("Mock USDT:", assetAddr);

  const MockYieldStrategy = await hre.ethers.getContractFactory("MockYieldStrategy");
  const strategy = await MockYieldStrategy.deploy(assetAddr);
  await strategy.waitForDeployment();
  const strategyAddr = await strategy.getAddress();
  console.log("MockYieldStrategy:", strategyAddr);

  const PrizePoolVault = await hre.ethers.getContractFactory("PrizePoolVault");
  const vault = await PrizePoolVault.deploy(
    assetAddr,
    "RSK Prize Pool rUSDT",
    "prUSDT",
    strategyAddr
  );
  await vault.waitForDeployment();
  const vaultAddr = await vault.getAddress();
  console.log("PrizePoolVault:", vaultAddr);

  const envPath = path.join(__dirname, "../frontend/.env.local");
  const envContent = `VITE_VAULT_ADDRESS=${vaultAddr}\nVITE_ASSET_ADDRESS=${assetAddr}\n`;
  fs.writeFileSync(envPath, envContent);
  console.log("Wrote", envPath);

  console.log("\nDeployment complete. Start frontend with: cd frontend && npm run dev");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
